.PHONY: all
all:
	@echo 'Nothing to do'

.PHONY: deploy
deploy:
	rsync -azl -f '- .git' -f '- .*.sw?' --delete --delete-excluded . bridge@tracking.open-cosmos.com:bin/
	ssh bridge@tracking.open-cosmos.com sudo re-relay all
	git tag --force live
