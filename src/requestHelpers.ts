import request from "request";

export interface RequestAuth {
    user: string,
    pass: string,
    sendImmediately: Boolean
};

export interface RequestPayload {
    url: string,
    method: string,
    body: string,
    rejectUnauthorized: Boolean,
    timeout: Number,
    followAllRedirects: Boolean,
    auth?: RequestAuth
};

export async function doRequest(method: string, url: string, body: string = "", auth?: RequestAuth) : Promise<string> {
    return new Promise(function (this, resolve, reject) {
        let payload : RequestPayload = { 
            url: url,
            method: method,
            body: body,
            rejectUnauthorized: false,
            timeout: 1000,
            followAllRedirects: true,
        }

        if (auth) {
            payload.auth = auth;
        }

        request(payload, function (error, res, body) {
            if (!error && res.statusCode == 200) {
                resolve(body);
            } else {
                reject(error);
            }
        });    
    });
}

export async function get(url: string, body: string = "", auth?: RequestAuth) : Promise<string> {
    return doRequest("GET", url, body, auth);
}

export async function post(url: string, body: string = "", auth?: RequestAuth) : Promise<string> {
    return doRequest("POST", url, body, auth);
}
