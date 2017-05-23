.PHONY: all
all:
	@echo 'Nothing to do'

.PHONY: deploy
deploy:
	rsync -azl . bridge@tracking.open-cosmos.com:bin/
	ssh bridge@tracking.open-cosmos.com sudo re-relay
	git tag --force live

.PHONY: deploy-monitor
deploy-monitor: monitor.js monitor_cache.js node_modules/
	rsync -azl $^ bridge@tracking.open-cosmos.com:bin/
