const CACHE = {};

import {JSONPath as fromPath} from "https://cdn.statically.io/gh/JSONPath-Plus/JSONPath/main/dist/index-browser-esm.min.js";

async function loadJson(url) {
    const key = `json:${url}`;

    if (key in CACHE) {
        return await CACHE[key];
    }

    return CACHE[key] = fetch(url)
        .then(r => r.json()).catch(() => null);
}

const defaultSchema = {item: "$[*]", id: "$.id", value: "$.value", label: "$.label"};

function evaluatePath(json, path, context, indexIfPath) {
    if (!path) {
        return json;
    }

    if (path.startsWith("!:")) {
        const exp = path.slice(2);
        const key = `func::${exp}`;
        const func = (key in CACHE) ? CACHE[key] : (
            CACHE[key] = new Function("item", "context", `return (${path.slice(2)});`)
        );
        return func(json, context);
    }

    const result = fromPath({path, json});
    if (indexIfPath !== undefined) {
        return result[indexIfPath];
    }
    return result;
}

function applySchema(json, schema, context) {
    schema = {...defaultSchema, ...schema};
    context ??= {};

    const items = evaluatePath(json, schema.item, context);
    if (!Array.isArray(items)) {
        return items;
    }

    return items.map(item => ({
        id: evaluatePath(item, schema.id, context, 0),
        label: evaluatePath(item, schema.label, context, 0),
        value: evaluatePath(item, schema.value, context, 0)
    })).sort((a, b) => (a.label ?? a.id).localeCompare(b.label ?? b.id))
}

export default class AddressApi {
    constructor(baseUrl) {
        const url = baseUrl ?? new URL(import.meta.url).origin;
        this.baseUrl = url.replace(/\/+$/, "");
        this.countries = this.countries.bind(this);
    }

    list(path) {
        return loadJson(`${this.baseUrl}/list/${path}`);
    }

    async countries(lang = (navigator.language?.split("-")?.[0]?.toLowerCase() ?? "en")) {
        const key = `countries::${lang}`;

        if (key in CACHE) {
            return CACHE[key];
        }

        const [countries, schema] = await Promise.all([
            this.list("countries.json"),
            this.list("countries.schema.json")
        ]);

        return CACHE[key] = applySchema(countries, schema, {lang});
    }

    available() {
        return this.list("available.json");
    }

    countryInfo(country) {
        return this.list(`${country}/info.json`);
    }
}