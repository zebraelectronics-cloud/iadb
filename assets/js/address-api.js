const CACHE = {};

import {JSONPath} from "https://cdn.statically.io/gh/JSONPath-Plus/JSONPath/main/dist/index-browser-esm.min.js";

async function loadJson(url) {
    const key = `json:${url}`;

    if (key in CACHE) {
        return await CACHE[key];
    }

    return CACHE[key] = fetch(url)
        .then(r => r.json()).catch(() => null);
}

export default class AddressApi {
    constructor(baseUrl) {
        const url = baseUrl ?? new URL(import.meta.url).origin;
        this.baseUrl = url.replace(/\/+$/, "");
        console.log(this.baseUrl);
    }

    list(path) {
        return loadJson(`${this.baseUrl}/list/${path}`);
    }

    async loadCountries() {
        if ("countries" in CACHE) {
            return CACHE["countries"];
        }

        const schema = await this.list("countries.schema.json");
        console.log(schema);
    }
}