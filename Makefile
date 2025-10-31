.PHONY: build


build: 
	rm -rf _extensao
	mkdir _extensao
	npm install
	npm run build
	zip -r plugin-simulacao.zip dist
	mv plugin-simulacao.zip _extensao
	mkdir _extensao/plugin_unpacked
	cp -r dist/* _extensao/plugin_unpacked