/**
 * Drip C++ SDK - Health Check for testdrip
 *
 * Runs connectivity and API checks against the live Drip API.
 * Matches the pattern of the JS (npm run check) and Python (python -m python.cli)
 * health checkers in the testdrip repo.
 *
 * Environment variables:
 *   DRIP_API_KEY  - Required. Your Drip API key.
 *   DRIP_API_URL  - Optional. API base URL (default: production).
 *   TEST_CUSTOMER_ID - Optional. Existing customer ID to use for tests.
 *
 * Usage:
 *   ./drip-health              # Run all checks
 *   ./drip-health --quick      # Ping only
 *   ./drip-health --race       # Run concurrent race-condition tests
 *   ./drip-health --verbose    # Show extra details
 */

#include <drip/drip.hpp>

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <functional>
#include <iostream>
#include <map>
#include <mutex>
#include <sstream>
#include <string>
#include <thread>
#include <vector>

// =============================================================================
// Types
// =============================================================================

struct CheckResult {
    std::string name;
    bool success;
    int duration_ms;
    std::string message;
    std::string details;
};

// =============================================================================
// ANSI colors
// =============================================================================

static const char* GREEN = "\033[32m";
static const char* RED   = "\033[31m";
static const char* DIM   = "\033[2m";
static const char* RESET = "\033[0m";

// =============================================================================
// Helpers
// =============================================================================

static std::map<std::string, std::string> load_dotenv() {
    std::map<std::string, std::string> m;
    std::ifstream f(".env");
    if (!f) return m;
    std::string line;
    while (std::getline(f, line)) {
        if (line.empty() || line[0] == '#') continue;
        size_t eq = line.find('=');
        if (eq == std::string::npos) continue;
        std::string key = line.substr(0, eq);
        std::string val = line.substr(eq + 1);
        // Trim trailing whitespace (common in .env)
        while (!key.empty() && (key.back() == ' ' || key.back() == '\t')) key.pop_back();
        while (!val.empty() && (val.back() == ' ' || val.back() == '\t' || val.back() == '\r')) val.pop_back();
        if (!key.empty()) m[key] = val;
    }
    return m;
}

static std::string env_or(const char* name, const std::string& fallback) {
    const char* val = std::getenv(name);
    if (val && val[0] != '\0') return std::string(val);
    static std::map<std::string, std::string> dotenv = load_dotenv();
    auto it = dotenv.find(name);
    if (it != dotenv.end() && !it->second.empty()) return it->second;
    return fallback;
}

static int64_t now_ms() {
    return std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::steady_clock::now().time_since_epoch()
    ).count();
}

// =============================================================================
// Checks
// =============================================================================

static CheckResult check_customer_create(drip::Client& client, std::string& customer_id_out) {
    auto start = now_ms();
    try {
        drip::CreateCustomerParams params;
        std::ostringstream ext_id;
        ext_id << "cpp_health_check_" << now_ms();
        params.external_customer_id = ext_id.str();
        params.metadata["test"] = "true";
        params.metadata["source"] = "cpp_health_check";

        auto result = client.createCustomer(params);
        int dur = static_cast<int>(now_ms() - start);
        customer_id_out = result.id;

        std::cout << "        id: " << result.id << std::endl;
        std::cout << "        external_customer_id: " << result.external_customer_id << std::endl;
        std::cout << "        status: " << result.status << std::endl;
        std::cout << "        created_at: " << result.created_at << std::endl;

        return {"Create Customer", true, dur, "Created " + result.id, "external_id: " + params.external_customer_id};
    } catch (const drip::DripError& e) {
        int dur = static_cast<int>(now_ms() - start);
        return {"Create Customer", false, dur, std::string("Failed: ") + e.what(), ""};
    }
}

static CheckResult check_connectivity(drip::Client& client) {
    auto start = now_ms();
    try {
        auto health = client.ping();
        int dur = static_cast<int>(now_ms() - start);

        std::cout << "        ok: " << (health.ok ? "true" : "false") << std::endl;
        std::cout << "        status: " << health.status << std::endl;
        std::cout << "        latency_ms: " << health.latency_ms << std::endl;
        std::cout << "        timestamp: " << health.timestamp << std::endl;

        if (health.ok) {
            std::ostringstream msg;
            msg << "API healthy (" << health.latency_ms << "ms latency)";
            return {"Ping", true, dur, msg.str(), ""};
        } else {
            return {"Ping", false, dur, "API returned unhealthy status: " + health.status, ""};
        }
    } catch (const drip::DripError& e) {
        int dur = static_cast<int>(now_ms() - start);
        return {"Ping", false, dur, std::string("Failed: ") + e.what(), ""};
    }
}

static CheckResult check_authentication(drip::Client& client) {
    auto start = now_ms();
    try {
        // Ping implicitly verifies auth since it uses the Bearer token
        auto health = client.ping();
        int dur = static_cast<int>(now_ms() - start);

        std::string key_desc;
        switch (client.key_type()) {
            case drip::KEY_SECRET:  key_desc = "secret key (sk_*)"; break;
            case drip::KEY_PUBLIC:  key_desc = "public key (pk_*)"; break;
            case drip::KEY_UNKNOWN: key_desc = "unknown key type"; break;
        }
        return {"Authentication", true, dur, "Authenticated with " + key_desc, ""};
    } catch (const drip::AuthenticationError& e) {
        int dur = static_cast<int>(now_ms() - start);
        return {"Authentication", false, dur, "Authentication failed", e.what()};
    } catch (const drip::DripError& e) {
        int dur = static_cast<int>(now_ms() - start);
        return {"Authentication", false, dur, std::string("Failed: ") + e.what(), ""};
    }
}

static CheckResult check_track_usage(drip::Client& client, const std::string& customer_id) {
    auto start = now_ms();
    try {
        drip::TrackUsageParams params;
        params.customer_id = customer_id;
        params.meter = "sdk_health_check";
        params.quantity = 1;
        params.units = "checks";
        params.description = "C++ SDK health check";
        params.metadata["sdk"] = "cpp";
        params.metadata["version"] = DRIP_SDK_VERSION;

        auto result = client.trackUsage(params);
        int dur = static_cast<int>(now_ms() - start);

        std::cout << "        success: " << (result.success ? "true" : "false") << std::endl;
        std::cout << "        usage_event_id: " << result.usage_event_id << std::endl;
        std::cout << "        customer_id: " << result.customer_id << std::endl;
        std::cout << "        usage_type: " << result.usage_type << std::endl;
        std::cout << "        quantity: " << result.quantity << std::endl;
        std::cout << "        message: " << result.message << std::endl;

        if (result.success) {
            return {"Track Usage", true, dur, "Event recorded: " + result.usage_event_id, ""};
        } else {
            return {"Track Usage", false, dur, "trackUsage returned success=false", ""};
        }
    } catch (const drip::DripError& e) {
        int dur = static_cast<int>(now_ms() - start);
        return {"Track Usage", false, dur, std::string("Failed: ") + e.what(), ""};
    }
}

static CheckResult check_get_customer(drip::Client& client, const std::string& customer_id) {
    auto start = now_ms();
    try {
        auto result = client.getCustomer(customer_id);
        int dur = static_cast<int>(now_ms() - start);

        std::cout << "        id: " << result.id << std::endl;
        std::cout << "        external_customer_id: " << result.external_customer_id << std::endl;
        std::cout << "        status: " << result.status << std::endl;
        std::cout << "        is_internal: " << (result.is_internal ? "true" : "false") << std::endl;
        std::cout << "        created_at: " << result.created_at << std::endl;

        return {"Get Customer", true, dur, "Retrieved " + result.id, ""};
    } catch (const drip::DripError& e) {
        int dur = static_cast<int>(now_ms() - start);
        return {"Get Customer", false, dur, std::string("Failed: ") + e.what(), ""};
    }
}

static CheckResult check_list_customers(drip::Client& client) {
    auto start = now_ms();
    try {
        drip::ListCustomersOptions opts;
        opts.limit = 5;
        auto result = client.listCustomers(opts);
        int dur = static_cast<int>(now_ms() - start);

        size_t show_count = std::min(result.customers.size(), static_cast<size_t>(5));
        std::cout << "        total: " << result.total << std::endl;
        std::cout << "        customers (first " << static_cast<int>(show_count) << "):" << std::endl;
        for (size_t i = 0; i < show_count; ++i) {
            const auto& c = result.customers[i];
            std::cout << "          [" << (i+1) << "] " << c.id << " (ext: " << c.external_customer_id << ", " << c.status << ")" << std::endl;
        }

        return {"List Customers", true, dur, "Listed " + std::to_string(result.total) + " total", ""};
    } catch (const drip::DripError& e) {
        int dur = static_cast<int>(now_ms() - start);
        return {"List Customers", false, dur, std::string("Failed: ") + e.what(), ""};
    }
}

static CheckResult check_get_balance(drip::Client& client, const std::string& customer_id) {
    auto start = now_ms();
    try {
        auto result = client.getBalance(customer_id);
        int dur = static_cast<int>(now_ms() - start);

        std::cout << "        customer_id: " << result.customer_id << std::endl;
        std::cout << "        balance_usdc: " << result.balance_usdc << std::endl;

        return {"Get Balance", true, dur, "Balance: " + result.balance_usdc + " USDC", ""};
    } catch (const drip::DripError& e) {
        int dur = static_cast<int>(now_ms() - start);
        return {"Get Balance", false, dur, std::string("Failed: ") + e.what(), ""};
    }
}

static CheckResult check_record_run(drip::Client& client, const std::string& customer_id, std::string& workflow_id_out) {
    auto start = now_ms();
    try {
        drip::RecordRunParams params;
        params.customer_id = customer_id;
        params.workflow = "cpp-health-check";
        params.status = drip::RUN_COMPLETED;

        drip::RecordRunEvent e1;
        e1.event_type = "health_check.start";
        e1.quantity = 1;
        params.events.push_back(e1);

        drip::RecordRunEvent e2;
        e2.event_type = "health_check.end";
        e2.quantity = 1;
        params.events.push_back(e2);

        auto result = client.recordRun(params);
        int dur = static_cast<int>(now_ms() - start);
        workflow_id_out = result.run.workflow_id;

        std::cout << "        run_id: " << result.run.id << std::endl;
        std::cout << "        workflow_id: " << result.run.workflow_id << std::endl;
        std::cout << "        workflow_name: " << result.run.workflow_name << std::endl;
        std::cout << "        events created: " << result.events.created << std::endl;
        std::cout << "        duration_ms: " << result.run.duration_ms << std::endl;
        std::cout << "        summary: " << result.summary << std::endl;

        return {"Record Run", true, dur, result.summary, ""};
    } catch (const drip::DripError& e) {
        int dur = static_cast<int>(now_ms() - start);
        return {"Record Run", false, dur, std::string("Failed: ") + e.what(), ""};
    }
}

static CheckResult check_start_run(drip::Client& client, const std::string& customer_id,
                                   const std::string& workflow_id, std::string& run_id_out) {
    auto start = now_ms();
    try {
        drip::StartRunParams params;
        params.customer_id = customer_id;
        params.workflow_id = workflow_id;
        params.metadata["source"] = "cpp_health_check";

        auto result = client.startRun(params);
        int dur = static_cast<int>(now_ms() - start);
        run_id_out = result.id;

        std::cout << "        run_id: " << result.id << std::endl;
        std::cout << "        customer_id: " << result.customer_id << std::endl;
        std::cout << "        workflow_id: " << result.workflow_id << std::endl;
        std::cout << "        workflow_name: " << result.workflow_name << std::endl;
        std::cout << "        status: " << drip::run_status_to_string(result.status) << std::endl;
        std::cout << "        created_at: " << result.created_at << std::endl;

        return {"Start Run", true, dur, "Started run " + result.id, ""};
    } catch (const drip::DripError& e) {
        int dur = static_cast<int>(now_ms() - start);
        return {"Start Run", false, dur, std::string("Failed: ") + e.what(), ""};
    }
}

static CheckResult check_emit_event(drip::Client& client, const std::string& run_id) {
    auto start = now_ms();
    try {
        drip::EmitEventParams params;
        params.run_id = run_id;
        params.event_type = "health_check.diagnostic";
        params.quantity = 1;
        params.units = "checks";
        params.description = "SDK full demo - emitEvent";

        auto result = client.emitEvent(params);
        int dur = static_cast<int>(now_ms() - start);

        std::cout << "        event_id: " << result.id << std::endl;
        std::cout << "        run_id: " << result.run_id << std::endl;
        std::cout << "        event_type: " << result.event_type << std::endl;
        std::cout << "        quantity: " << result.quantity << std::endl;
        std::cout << "        is_duplicate: " << (result.is_duplicate ? "true" : "false") << std::endl;
        std::cout << "        timestamp: " << result.timestamp << std::endl;

        return {"Emit Event", true, dur, "Emitted event " + result.id, ""};
    } catch (const drip::DripError& e) {
        int dur = static_cast<int>(now_ms() - start);
        return {"Emit Event", false, dur, std::string("Failed: ") + e.what(), ""};
    }
}

static CheckResult check_end_run(drip::Client& client, const std::string& run_id) {
    auto start = now_ms();
    try {
        drip::EndRunParams params;
        params.status = drip::RUN_COMPLETED;
        params.metadata["completed_by"] = "cpp_health_check";

        auto result = client.endRun(run_id, params);
        int dur = static_cast<int>(now_ms() - start);

        std::cout << "        run_id: " << result.id << std::endl;
        std::cout << "        status: " << drip::run_status_to_string(result.status) << std::endl;
        std::cout << "        ended_at: " << result.ended_at << std::endl;
        std::cout << "        duration_ms: " << result.duration_ms << std::endl;
        std::cout << "        event_count: " << result.event_count << std::endl;
        std::cout << "        total_cost_units: " << result.total_cost_units << std::endl;

        return {"End Run", true, dur, "Ended run in " + std::to_string(result.duration_ms) + "ms", ""};
    } catch (const drip::DripError& e) {
        int dur = static_cast<int>(now_ms() - start);
        return {"End Run", false, dur, std::string("Failed: ") + e.what(), ""};
    }
}

// =============================================================================
// Race condition tests (production-like concurrency scenarios)
// =============================================================================

struct RaceTestResult {
    std::string name;
    bool passed;
    int total;
    int succeeded;
    int failed;
    std::string details;
    std::vector<std::string> errors;
};

/** Thread-safe collector for exception messages from concurrent workers. */
struct ErrorCollector {
    std::mutex mtx;
    std::vector<std::string> messages;
    static const size_t max_capture = 5;

    void add(const std::exception& e) {
        std::lock_guard<std::mutex> lock(mtx);
        if (messages.size() >= max_capture) return;
        std::string msg = e.what();
        if (const drip::DripError* de = dynamic_cast<const drip::DripError*>(&e)) {
            msg += " [HTTP " + std::to_string(de->status_code()) + ", code: " + de->code() + "]";
        }
        messages.push_back(msg);
    }
};

static void run_race_concurrent_track_usage(drip::Client& client, const std::string& customer_id,
        int num_threads, std::atomic<int>& ok, std::atomic<int>& fail, ErrorCollector& errs) {
    const int calls_per_thread = 3;
    auto worker = [&]() {
        for (int i = 0; i < calls_per_thread; ++i) {
            try {
                drip::TrackUsageParams params;
                params.customer_id = customer_id;
                params.meter = "race_concurrent";
                params.quantity = static_cast<double>(1 + (i % 10));  // Vary quantity to avoid idem collision
                params.units = "calls";
                params.metadata["thread"] = std::to_string(std::hash<std::thread::id>()(std::this_thread::get_id()) % 1000);
                client.trackUsage(params);
                ok++;
            } catch (const std::exception& e) {
                fail++;
                errs.add(e);
            } catch (...) {
                fail++;
                errs.add(std::runtime_error("unknown exception"));
            }
        }
    };
    std::vector<std::thread> threads;
    for (int t = 0; t < num_threads; ++t) {
        threads.emplace_back(worker);
    }
    for (auto& th : threads) th.join();
}

static void run_race_idempotency_collision(drip::Client& client, const std::string& customer_id,
        int num_threads, std::atomic<int>& ok, std::atomic<int>& fail, ErrorCollector& errs) {
    std::string idem_key = "race_idem_" + std::to_string(now_ms());
    auto worker = [&]() {
        try {
            drip::TrackUsageParams params;
            params.customer_id = customer_id;
            params.meter = "race_idempotency";
            params.quantity = 1;
            params.idempotency_key = idem_key;  // Same key from all threads - tests idempotency
            params.units = "collision_test";
            client.trackUsage(params);
            ok++;
        } catch (const std::exception& e) {
            fail++;
            errs.add(e);
        } catch (...) {
            fail++;
            errs.add(std::runtime_error("unknown exception"));
        }
    };
    std::vector<std::thread> threads;
    for (int t = 0; t < num_threads; ++t) {
        threads.emplace_back(worker);
    }
    for (auto& th : threads) th.join();
}

static void run_race_duplicate_create_customer(drip::Client& client,
        const std::string& ext_id, std::atomic<int>& ok, std::atomic<int>& fail, ErrorCollector& errs) {
    auto worker = [&]() {
        try {
            drip::CreateCustomerParams params;
            params.external_customer_id = ext_id;  // Same from all threads - race to create
            params.metadata["race_test"] = "true";
            client.createCustomer(params);
            ok++;
        } catch (const std::exception& e) {
            fail++;  // Expected: one succeeds, others may conflict
            errs.add(e);
        } catch (...) {
            fail++;
            errs.add(std::runtime_error("unknown exception"));
        }
    };
    std::vector<std::thread> threads;
    for (int i = 0; i < 4; ++i) threads.emplace_back(worker);
    for (auto& th : threads) th.join();
}

static void run_race_mixed_load(drip::Client& client, const std::string& customer_id,
        int num_threads, std::atomic<int>& ok, std::atomic<int>& fail, ErrorCollector& errs) {
    auto worker = [&](int i) {
        try {
            if (i % 4 == 0) {
                client.ping();
            } else if (i % 4 == 1) {
                drip::TrackUsageParams params;
                params.customer_id = customer_id;
                params.meter = "race_mixed";
                params.quantity = i;
                params.idempotency_key = "race_mixed_" + std::to_string(i);
                client.trackUsage(params);
            } else if (i % 4 == 2) {
                client.listCustomers(drip::ListCustomersOptions());
            } else {
                client.getBalance(customer_id);
            }
            ok++;
        } catch (const std::exception& e) {
            fail++;
            errs.add(e);
        } catch (...) {
            fail++;
            errs.add(std::runtime_error("unknown exception"));
        }
    };
    std::vector<std::thread> threads;
    for (int t = 0; t < num_threads; ++t) {
        threads.emplace_back(worker, t);
    }
    for (auto& th : threads) th.join();
}

static void run_race_concurrent_record_run(drip::Client& client, const std::string& customer_id,
        const std::string& workflow, int num_threads, std::atomic<int>& ok, std::atomic<int>& fail, ErrorCollector& errs) {
    auto worker = [&](int idx) {
        try {
            drip::RecordRunParams params;
            params.customer_id = customer_id;
            params.workflow = workflow;
            params.status = drip::RUN_COMPLETED;
            params.external_run_id = "race_run_" + std::to_string(now_ms()) + "_" + std::to_string(idx);

            drip::RecordRunEvent e;
            e.event_type = "race.event";
            e.quantity = idx;
            params.events.push_back(e);

            client.recordRun(params);
            ok++;
        } catch (const std::exception& e) {
            fail++;
            errs.add(e);
        } catch (...) {
            fail++;
            errs.add(std::runtime_error("unknown exception"));
        }
    };
    std::vector<std::thread> threads;
    for (int t = 0; t < num_threads; ++t) {
        threads.emplace_back(worker, t);
    }
    for (auto& th : threads) th.join();
}

static std::vector<RaceTestResult> run_race_tests(drip::Client& client, const std::string& customer_id) {
    std::vector<RaceTestResult> results;
    const int threads = 6;

    // 1. Concurrent trackUsage - shared client, same customer
    {
        std::atomic<int> ok{0}, fail{0};
        ErrorCollector errs;
        run_race_concurrent_track_usage(client, customer_id, threads, ok, fail, errs);
        int total = threads * 3;  // 3 calls per thread
        RaceTestResult r{"Concurrent trackUsage (shared client)", fail == 0,
            total, static_cast<int>(ok), static_cast<int>(fail),
            std::to_string(ok) + "/" + std::to_string(total) + " succeeded", errs.messages};
        results.push_back(r);
    }

    // 2. Idempotency collision - same idempotency key from multiple threads
    {
        std::atomic<int> ok{0}, fail{0};
        ErrorCollector errs;
        run_race_idempotency_collision(client, customer_id, 4, ok, fail, errs);
        int total = 4;
        bool pass = (ok >= 1 && ok <= total);  // At least one success, duplicates handled gracefully
        RaceTestResult r{"Idempotency key collision (same key, 4 threads)", pass,
            total, static_cast<int>(ok), static_cast<int>(fail),
            std::to_string(ok) + " accepted (duplicates expected to be deduped)", errs.messages};
        results.push_back(r);
    }

    // 3. Duplicate createCustomer - race to create same external_id
    {
        std::atomic<int> ok{0}, fail{0};
        ErrorCollector errs;
        std::string ext_id = "race_dup_create_" + std::to_string(now_ms());
        run_race_duplicate_create_customer(client, ext_id, ok, fail, errs);
        int total = 4;
        bool pass = (ok >= 1);  // At least one should succeed
        RaceTestResult r{"Duplicate createCustomer (same ext_id, 4 threads)", pass,
            total, static_cast<int>(ok), static_cast<int>(fail),
            std::to_string(ok) + " succeeded, " + std::to_string(fail) + " failed (conflicts expected)", errs.messages};
        results.push_back(r);
    }

    // 4. Mixed load - ping, trackUsage, listCustomers, getBalance interleaved
    {
        std::atomic<int> ok{0}, fail{0};
        ErrorCollector errs;
        run_race_mixed_load(client, customer_id, 12, ok, fail, errs);
        int total = 12;
        RaceTestResult r{"Mixed load (ping/track/list/balance, 12 threads)", fail == 0,
            total, static_cast<int>(ok), static_cast<int>(fail),
            std::to_string(ok) + "/" + std::to_string(total) + " succeeded", errs.messages};
        results.push_back(r);
    }

    // 5. Concurrent recordRun
    {
        std::atomic<int> ok{0}, fail{0};
        ErrorCollector errs;
        run_race_concurrent_record_run(client, customer_id, "cpp-race-test", 4, ok, fail, errs);
        int total = 4;
        RaceTestResult r{"Concurrent recordRun (4 threads)", fail == 0,
            total, static_cast<int>(ok), static_cast<int>(fail),
            std::to_string(ok) + "/" + std::to_string(total) + " succeeded", errs.messages};
        results.push_back(r);
    }

    return results;
}

// =============================================================================
// Reporter
// =============================================================================

static void print_result(const CheckResult& r, bool verbose) {
    const char* icon = r.success ? GREEN : RED;
    const char* status = r.success ? "PASS" : "FAIL";

    std::cout << "  " << icon << "[" << status << "]" << RESET
              << " " << r.name
              << DIM << " (" << r.duration_ms << "ms)" << RESET
              << std::endl;

    if (!r.message.empty()) {
        std::cout << "        " << r.message << std::endl;
    }

    if (verbose && !r.details.empty()) {
        std::cout << "        " << DIM << r.details << RESET << std::endl;
    }
}

// =============================================================================
// Main
// =============================================================================

int main(int argc, char** argv) {
    bool quick = false;
    bool verbose = false;
    bool race = false;

    for (int i = 1; i < argc; ++i) {
        if (std::strcmp(argv[i], "--quick") == 0) quick = true;
        else if (std::strcmp(argv[i], "--verbose") == 0 || std::strcmp(argv[i], "-v") == 0) verbose = true;
        else if (std::strcmp(argv[i], "--race") == 0) race = true;
        else if (std::strcmp(argv[i], "--help") == 0 || std::strcmp(argv[i], "-h") == 0) {
            std::cout << "Usage: drip-health [OPTIONS]\n\n"
                      << "Options:\n"
                      << "  --quick      Run connectivity checks only\n"
                      << "  --race       Run concurrent race-condition tests\n"
                      << "  --verbose    Show extra details\n"
                      << "  --help       Show this help\n";
            return 0;
        }
    }

    std::string test_customer_id = env_or("TEST_CUSTOMER_ID", "");
    std::string customer_id;

    std::cout << std::endl;
    std::cout << "Drip C++ SDK Health Check v" << DRIP_SDK_VERSION << std::endl;
    std::cout << "==========================================" << std::endl;

    // Initialize client
    drip::Config config;
    config.api_key = env_or("DRIP_API_KEY", "");
    std::string api_url = env_or("DRIP_API_URL", "");
    if (!api_url.empty()) {
        // Ensure /v1 suffix
        if (api_url.size() < 3 || api_url.substr(api_url.size() - 3) != "/v1") {
            api_url += "/v1";
        }
        config.base_url = api_url;
    }

    try {
        drip::Client client(config);

        if (verbose) {
            std::cout << DIM << "  API URL: " << (config.base_url.empty() ? "(default)" : config.base_url) << RESET << std::endl;
            std::cout << DIM << "  Customer: " << (!test_customer_id.empty() && test_customer_id != "seed-customer-1" ? test_customer_id : "will create") << RESET << std::endl;
            std::cout << std::endl;
        }

        // --race: Run concurrent race-condition tests only
        if (race) {
            std::cout << "\n--- Race Condition Tests ---\n" << std::endl;
            if (!check_connectivity(client).success) {
                std::cerr << RED << "API unreachable. Skipping race tests." << RESET << std::endl;
                return 1;
            }
            if (test_customer_id.empty() || test_customer_id == "seed-customer-1") {
                CheckResult cr = check_customer_create(client, customer_id);
                if (!cr.success) {
                    std::cerr << RED << "Cannot run race tests without a customer." << RESET << std::endl;
                    return 1;
                }
            } else {
                customer_id = test_customer_id;
            }
            std::cout << "Using customer: " << customer_id << std::endl << std::endl;

            auto race_results = run_race_tests(client, customer_id);
            int race_passed = 0, race_failed = 0;
            for (const auto& r : race_results) {
                const char* icon = r.passed ? GREEN : RED;
                const char* status = r.passed ? "PASS" : "FAIL";
                std::cout << "  " << icon << "[" << status << "]" << RESET << " " << r.name << std::endl;
                std::cout << "        " << r.details << std::endl;
                for (const auto& err : r.errors) {
                    std::cout << "        " << RED << "ERROR: " << err << RESET << std::endl;
                }
                if (r.passed) ++race_passed; else ++race_failed;
            }
            std::cout << "\n==========================================" << std::endl;
            if (race_failed == 0) {
                std::cout << GREEN << "All " << race_passed << " race tests passed." << RESET << std::endl;
            } else {
                std::cout << RED << race_failed << " of " << (race_passed + race_failed) << " race tests failed." << RESET << std::endl;
            }
            std::cout << std::endl;
            return race_failed > 0 ? 1 : 0;
        }

        // Run checks
        std::vector<CheckResult> results;
        std::string workflow_id;
        std::string run_id;

        // Always run connectivity + auth
        results.push_back(check_connectivity(client));
        results.push_back(check_authentication(client));

        if (!quick) {
            // List customers (doesn't require a specific customer)
            results.push_back(check_list_customers(client));

            // Get customer: use TEST_CUSTOMER_ID if set, otherwise create one
            if (!test_customer_id.empty() && test_customer_id != "seed-customer-1") {
                customer_id = test_customer_id;
            } else {
                CheckResult cr = check_customer_create(client, customer_id);
                results.push_back(cr);
                if (!cr.success) {
                    std::cerr << RED << "Cannot run remaining checks without a customer." << RESET << std::endl;
                }
            }
            if (!customer_id.empty()) {
                results.push_back(check_get_customer(client, customer_id));
                results.push_back(check_get_balance(client, customer_id));
                results.push_back(check_track_usage(client, customer_id));
                results.push_back(check_record_run(client, customer_id, workflow_id));
                if (!workflow_id.empty()) {
                    CheckResult sr = check_start_run(client, customer_id, workflow_id, run_id);
                    results.push_back(sr);
                    if (sr.success && !run_id.empty()) {
                        results.push_back(check_emit_event(client, run_id));
                        results.push_back(check_end_run(client, run_id));
                    }
                }
            }
        }

        // Print results
        std::cout << std::endl;
        for (size_t i = 0; i < results.size(); ++i) {
            print_result(results[i], verbose);
        }

        // Summary
        int passed = 0, failed = 0;
        for (size_t i = 0; i < results.size(); ++i) {
            if (results[i].success) ++passed;
            else ++failed;
        }

        std::cout << std::endl;
        std::cout << "==========================================" << std::endl;

        if (failed == 0) {
            std::cout << GREEN << "All " << passed << " checks passed." << RESET << std::endl;
        } else {
            std::cout << RED << failed << " of " << (passed + failed) << " checks failed." << RESET << std::endl;
        }

        std::cout << std::endl;
        return failed > 0 ? 1 : 0;

    } catch (const drip::DripError& e) {
        std::cerr << RED << "FATAL: " << e.what() << RESET << std::endl;
        std::cerr << "Ensure DRIP_API_KEY is set." << std::endl;
        return 1;
    } catch (const std::exception& e) {
        std::cerr << RED << "FATAL: " << e.what() << RESET << std::endl;
        return 1;
    }
}
