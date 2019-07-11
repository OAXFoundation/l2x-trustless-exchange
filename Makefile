# ----------------------------------------
# Settings
# ----------------------------------------

contract_names := \
	ETHToken \
	OAXToken \
	Mediator \
	MediatorMock \
	MediatorMockNoTime \
	MediatorMockChaos \
	ERC20 \
	Struct

solidity_dir := src/contracts
contract_output_dir := build/contracts
wrappers_dir := src/contracts/wrappers

.DEFAULT_GOAL: all

# ----------------------------------------
# Build Targets
# ----------------------------------------

abis = $(foreach name, ${contract_names}, ${contract_output_dir}/${name}.abi)
bins = $(foreach name, ${contract_names}, ${contract_output_dir}/${name}.bin)
wrappers = $(foreach name, ${contract_names}, ${wrappers_dir}/${name}.d.ts)

# ----------------------------------------
# Tasks
# ----------------------------------------

.PHONY: all
all: contracts

.PHONY: contracts
contracts: ${abis} ${bins} ${wrappers}

.PHONY: clean
clean:
	-rm ${wrappers_dir}/*
	-rm ${contract_output_dir}/*

# ----------------------------------------
# Rules
# ----------------------------------------

${contract_output_dir}:
	mkdir -p $@

${wrappers_dir}:
	mkdir -p $@


${solidity_dir}/MediatorMockChaos.sol: ${solidity_dir}/Mediator.sol
	touch $@

${solidity_dir}/MediatorMock.sol: ${solidity_dir}/Mediator.sol
	touch $@

${contract_output_dir}/%.abi ${contract_output_dir}/%.bin: ${solidity_dir}/%.sol | ${contract_output_dir}
	# Could not find way to make solium fail on error, therefore piping output through awk.
	solium -f $< | awk 'BEGIN{s=1} /No issues found/{s=0} 1; END{exit(s)}'
	solc --optimize --abi --bin --overwrite --output-dir build/contracts/ $? 2>&1 | grcat .solc-colors
	echo "name"
	echo $?

${wrappers_dir}/%.d.ts: ${contract_output_dir}/%.abi | ${wrappers_dir}
	pnpx typechain --target ethers --outDir ${wrappers_dir}/ $?
