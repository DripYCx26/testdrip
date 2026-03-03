# =============================================================================
# Drip C++ Test Suite - Makefile
# =============================================================================
#
# Build and run C++ tests against the live Drip API.
#
# Usage:
#   make              # Build all test binaries
#   make run          # Build and run health check
#   make run-ml       # Build and run ML training tests
#   make run-all      # Build and run everything
#   make run-quick    # Build and run (ping only)
#   make clean        # Clean build artifacts
#
# Environment:
#   DRIP_API_KEY      - Required
#   DRIP_API_URL      - Optional (default: production)
#   TEST_CUSTOMER_ID  - Optional (default: seed-customer-1)
#
# =============================================================================

CXX       ?= g++
CXXFLAGS  ?= -std=c++11 -Wall -Wextra -O2

# SDK location (relative to this Makefile)
SDK_DIR    = ../cpp-sdk
BUILD_DIR  = build

# Windows: use .exe suffix
ifeq ($(OS),Windows_NT)
  EXE = .exe
else
  EXE =
endif

# Targets
HEALTH_BIN = $(BUILD_DIR)/drip-health$(EXE)
ML_BIN     = $(BUILD_DIR)/drip-ml-test$(EXE)

.PHONY: all run run-ml run-all run-quick run-verbose run-race clean sdk

all: $(HEALTH_BIN) $(ML_BIN)

# Build the SDK first
sdk:
	@$(MAKE) -C $(SDK_DIR) --no-print-directory

# Build health check
$(HEALTH_BIN): main.cpp sdk | $(BUILD_DIR)
	$(CXX) $(CXXFLAGS) \
		-I$(SDK_DIR)/include \
		-I$(SDK_DIR)/third_party \
		-o $@ $< \
		-L$(SDK_DIR)/build -ldrip -lcurl

# Build ML training tests
$(ML_BIN): ml_training_test.cpp sdk | $(BUILD_DIR)
	$(CXX) $(CXXFLAGS) \
		-I$(SDK_DIR)/include \
		-I$(SDK_DIR)/third_party \
		-o $@ $< \
		-L$(SDK_DIR)/build -ldrip -lcurl

$(BUILD_DIR):
	mkdir -p $(BUILD_DIR)

# Run health check
run: $(HEALTH_BIN)
	@$(HEALTH_BIN)

run-quick: $(HEALTH_BIN)
	@$(HEALTH_BIN) --quick

run-race: $(HEALTH_BIN)
	@$(HEALTH_BIN) --race

run-verbose: $(HEALTH_BIN)
	@$(HEALTH_BIN) --verbose

# Run ML training tests
run-ml: $(ML_BIN)
	@$(ML_BIN)

run-ml-verbose: $(ML_BIN)
	@$(ML_BIN) --verbose

# Run a specific ML scenario
run-ml-scenario: $(ML_BIN)
	@$(ML_BIN) --scenario $(S)

# Run everything
run-all: $(HEALTH_BIN) $(ML_BIN)
	@echo "=== Health Check ==="
	@$(HEALTH_BIN) && echo "" && echo "=== ML Training Tests ===" && $(ML_BIN)

clean:
	rm -rf $(BUILD_DIR)
