.PHONY: dev

# The API on :3000 and the web app on :5173 together; Ctrl-C stops both.
dev: web/node_modules
	@trap 'kill 0' INT TERM EXIT; \
	go run ./cmd/bangkee & \
	(cd web && npm run dev) & \
	wait

web/node_modules: web/package-lock.json
	cd web && npm install
	@touch web/node_modules
