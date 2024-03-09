console.log(import.meta.url);

export default class AddressApi {
    constructor(baseUrl) {
        baseUrl ??= import.meta?.url ?? "https://iadb.fast-page.org/";
        this.baseUrl = baseUrl;
        console.log(baseUrl);
    }
}