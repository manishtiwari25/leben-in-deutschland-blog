run-generator:
	@echo "Running generator" && cd tools/generate-blogs && npm run dev && cd ../..
install-generator:
	@echo "Running generator" && cd tools/generate-blogs && npm install && cd ../..