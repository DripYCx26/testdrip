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
 *   ./drip-health --verbose    # Show extra details
 */

#include <drip/drip.hpp>

#include <iostream>
#include <string>
#include <vector>
#include <chrono>
#include <cstdlib>
#include <cstring>
#include <functional>
#include <sstream>
#include <fstream>
#include <map>

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

        return {"Customer Create", true, dur, "Created " + result.id, "external_id: " + params.external_customer_id};
    } catch (const drip::DripError& e) {
        int dur = static_cast<int>(now_ms() - start);
        return {"Customer Create", false, dur, std::string("Failed: ") + e.what(), ""};
    }
}

static CheckResult check_connectivity(drip::Client& client) {
    auto start = now_ms();
    try {
        auto health = client.ping();
        int dur = static_cast<int>(now_ms() - start);

        if (health.ok) {
            std::ostringstream msg;
            msg << "API healthy (" << health.latency_ms << "ms latency)";
            return {"Connectivity", true, dur, msg.str(), ""};
        } else {
            return {"Connectivity", false, dur, "API returned unhealthy status: " + health.status, ""};
        }
    } catch (const drip::DripError& e) {
        int dur = static_cast<int>(now_ms() - start);
        return {"Connectivity", false, dur, std::string("Failed: ") + e.what(), ""};
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

static CheckResult check_record_run(drip::Client& client, const std::string& customer_id) {
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

        return {"Record Run", true, dur, result.summary, ""};
    } catch (const drip::DripError& e) {
        int dur = static_cast<int>(now_ms() - start);
        return {"Record Run", false, dur, std::string("Failed: ") + e.what(), ""};
    }
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

    for (int i = 1; i < argc; ++i) {
        if (std::strcmp(argv[i], "--quick") == 0) quick = true;
        else if (std::strcmp(argv[i], "--verbose") == 0 || std::strcmp(argv[i], "-v") == 0) verbose = true;
        else if (std::strcmp(argv[i], "--help") == 0 || std::strcmp(argv[i], "-h") == 0) {
            std::cout << "Usage: drip-health [OPTIONS]\n\n"
                      << "Options:\n"
                      << "  --quick      Run connectivity checks only\n"
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

        // Run checks
        std::vector<CheckResult> results;

        // Always run connectivity + auth
        results.push_back(check_connectivity(client));
        results.push_back(check_authentication(client));

        if (!quick) {
            // Get customer: use TEST_CUSTOMER_ID if set, otherwise create one
            if (!test_customer_id.empty() && test_customer_id != "seed-customer-1") {
                customer_id = test_customer_id;
                results.push_back({"Customer", true, 0, "Using " + customer_id, "(TEST_CUSTOMER_ID)"});
            } else {
                CheckResult cr = check_customer_create(client, customer_id);
                results.push_back(cr);
                if (!cr.success) {
                    std::cerr << RED << "Cannot run Track Usage / Record Run without a customer." << RESET << std::endl;
                }
            }
            if (!customer_id.empty()) {
                results.push_back(check_track_usage(client, customer_id));
                results.push_back(check_record_run(client, customer_id));
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
