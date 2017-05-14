.PHONY: all
all:
	@echo 'Nothing to do'

.PHONY: deploy
deploy:
	rsync -az regrpc_adapter.js regrpccli get-real-frequency.sh bridge@tracking.open-cosmos.com:bin/
	ssh bridge@tracking.open-cosmos.com sudo re-relay
