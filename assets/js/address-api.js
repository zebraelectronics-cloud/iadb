const CACHE = {};

import {JSONPath as fromPath} from "https://cdn.statically.io/gh/JSONPath-Plus/JSONPath/main/dist/index-browser-esm.min.js";

export const ABORTED = Object.freeze({});

async function loadJson(url, signal) {
    const key = `json:${url}`;

    if (key in CACHE) {
        return await CACHE[key];
    }

    return CACHE[key] = fetch(url, {signal})
        .then(r => {
            switch (r.status) {
                case 404:
                    return false;
                case 200:
                    return r.json();
                default:
                    return null;
            }
        })
        .catch(() => {
            if (signal.aborted) {
                return ABORTED;
            }
            return null;
        });
}

const defaultSchema = {item: "$[*]", id: "$[0]", value: "$[1]", label: "$[1]"};

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

const formatKeyExp = /(CY|STA|CI|DI|CO|NE|ST|BU|DO|AD)/g;
const conditionKeyExp = /([&!])?(CY|STA|CI|DI|CO|NE|ST|BU|DO|AD)/g
export default class AddressApi {
    constructor(baseUrl) {
        const url = baseUrl ?? new URL(import.meta.url).origin;
        this.baseUrl = url.replace(/\/+$/, "");
    }

    abort(reason) {
        this.__abortController?.abort(reason);
        delete this.__abortController;
    }

    createSession() {
        const api = new AddressApi(this.baseUrl);
        api.__abortController = new AbortController();
        return api;
    }

    list(path) {
        return loadJson(`${this.baseUrl}/list/${path}`, this.__abortController?.signal);
    }

    detail(path) {
        return loadJson(`${this.baseUrl}/detail/${path}`, this.__abortController?.signal);
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

        if (countries === ABORTED || schema === ABORTED) {
            return ABORTED;
        }

        return CACHE[key] = applySchema(countries, schema, {lang});
    }

    available() {
        return this.list("available.json");
    }

    countryInfo(country) {
        return this.list(`${country}/info.json`);
    }

    async loadFlow({category, id}, countryId, parentId) {
        id ??= parentId;
        const key = `flow::${category}::${countryId}::${parentId}::${id}`;

        if (key in CACHE) {
            return CACHE[key];
        }

        const detailPath = category === "country" ? "country" : `${category}/${id}`

        const [data, schema] = await Promise.all([
            category === "country"
                ? this.list(`${countryId}/country.json`)
                : this.detail(`${countryId}/${category}/${id}.json`),
            this.list(`${countryId}/${category}.schema.json`)
        ]);

        if (data === ABORTED || schema === ABORTED) {
            return ABORTED;
        }

        return CACHE[key] = applySchema(data, schema);
    }

    formatAddress(formatStr, formatArgs, exceptions) {
        const args = {...formatArgs};
        if (typeof exceptions === "object") {
            Object.entries(args).forEach(([k,v]) => {
                if (!(k in exceptions)) {
                    return;
                }

                let exception = exceptions[k];
                if (!exception) {
                    return;
                }

                if (!Array.isArray(exception)) {
                    exception = [exception];
                }

                if (exception.includes(v)) {
                    delete args[k];
                }
            });
        }

        return formatStr.replace(/\{(?:([^:]+):)?(.+?)}/g, (_, condition, group) => {
            if (condition) {
                conditionKeyExp.lastIndex = 0;
                let isValid = true;
                let m;
                while ((m = conditionKeyExp.exec(condition))) {
                    isValid = (m[2] in args && args[m[2]] !== "") === ((m[1] ?? "&") === "&");
                    if (!isValid) {
                        break;
                    }
                }
                if (!isValid) {
                    return "";
                }
            }

            return group.replace(formatKeyExp, (_, key) => args[key]?.toLocaleUpperCase(navigator.language));
        })
    }
}