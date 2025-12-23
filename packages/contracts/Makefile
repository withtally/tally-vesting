.PHONY: anvil seed clean-seed test

# Start Anvil local node
anvil:
	@./script/anvil.sh

# Seed local Anvil with test data (requires Anvil running)
seed:
	@./script/seed.sh

# Clean seed output
clean-seed:
	@rm -rf seed-output/

# Run all tests
test:
	@forge test
