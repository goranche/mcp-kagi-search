import fetch, { RequestInit, Headers } from "node-fetch";

interface KagiMeta {
	id: string
	node: string
	ms: number
	api_balance?: number | undefined
};

interface KagiImage {
	url: string
	height: number
	width: number
};

interface KagiSearchItem {
	t: number
	rank?: number | undefined
	url?: string | undefined
	title?: string | undefined
	snippet?: string | undefined
	published?: string | undefined
	thumbnail?: KagiImage | undefined
	list?: string[] | undefined
};

type GenericJSON = { [key: string]: string | number | boolean | GenericJSON[] | GenericJSON };

interface KagiErrorItem {
	code?: number | undefined
	msg?: string | undefined
	res?: string | undefined
	other?: GenericJSON | undefined
};

interface SearchResponse {
	meta: KagiMeta,
	data?: KagiSearchItem[] | undefined,
	error?: KagiErrorItem[] | undefined
};

export class KagiClient {
	private searchUrl: URL
	private requestInit: RequestInit;

	constructor(apiKey: string) {
		const apiVersion = "v0";
		const baseUrlString = `https://kagi.com/api/${apiVersion}`;
		const searchUrlString = `${baseUrlString}/search`;

		const searchUrl = URL.parse(searchUrlString);
		if (!searchUrl) {
			throw new Error("Could not create the search URL");
		}
		// don't know how to properly unwrap optionals
		// the following is safe because of the if above, but still ugly
		this.searchUrl = searchUrl!;

		const headers = new Headers();
		headers.append("Authorization", `Bot ${apiKey}`);
		headers.append("User-Agent", "mcp-kagi-search / 0.1.0 https://github.com/goranche/mcp-kagi-search");
		this.requestInit = {
			headers: headers
		};
	}

	async search(query: string, limit: number | undefined): Promise<SearchResponse> {
		try {
			const searchUrl = new URL(this.searchUrl);
			searchUrl.search = `q=${query}`;
			if (limit) {
				searchUrl.search += `&limit=${limit}`;
			}
			
			const response = await fetch(searchUrl, this.requestInit);
			const data = await response.text();

			const object = await JSON.parse(data) as SearchResponse;

			if (object.data && object.data.length > 0) {
				object.data = object.data.filter((value) => !value.list );
			}

			return object;
		} catch (err: unknown) {
			const error = err as Error;
			const result: SearchResponse = {
				meta: {
					id: "",
					node: "",
					ms: 0
				},
				data: [],
				error: [{
					other: {
						name: `${error.name}`,
						message: `${error.message}`
					}
				}]
			};
			return result;
		}
	}
};
