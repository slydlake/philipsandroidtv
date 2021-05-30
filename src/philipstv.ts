import { get, post, RequestAuth } from './requestHelpers';
import { prepareAuthenticationRequestPayload } from './cmds/auth';
import { createUniquePairRequestPayload } from './cmds/pair';

const validate = {
    mac: /^([0-9A-F]{2}[:-]){5}([0-9A-F]{2})$/,
    // eslint-disable-next-line
    ip: /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/,
    pin: /^[0-9]{4}$/,
};

export class PhilipsTV {
    private ip: string;
    private mac?: string;
    private auth?: RequestAuth;

    constructor(ip: string, mac?: string, auth?: RequestAuth) {
        if (!validate.ip.test(ip)) {
            throw 'IP is not an IP Address!';
        }

        this.ip = ip;

        if (mac && !validate.mac.test(mac)) {
            throw 'Provided MAC is not an MAC Address!';
        } else if (mac) {
            this.mac = mac;
        }

        this.auth = auth;
    }

    async info() : Promise<Record<string, unknown>> {
        const url = 'http://' + this.ip + ':1925/6/system';
        const result = await get(url);
        const response = JSON.parse(result);
        return response;
    }

    async pair(pinCallback: () => Promise<string>) {
        const pair_url = 'https://' + this.ip + ':1926/6/pair/request';
        const pair_payload = createUniquePairRequestPayload();
        const pair_result = await post(pair_url, JSON.stringify(pair_payload));
        const pair_response = JSON.parse(pair_result);

        const pin = await pinCallback();

        const auth_url = 'https://' + this.ip + ':1926/6/pair/grant';
        const auth_payload = prepareAuthenticationRequestPayload(
            pair_response.timestamp,
            pin,
            pair_payload.device_id,
            pair_response.auth_key,
        );

        this.auth = {
            user: pair_payload.device_id,
            pass: pair_response.auth_key,
            sendImmediately: false,
        };

        const auth_result = await post(auth_url, JSON.stringify(auth_payload), this.auth);

        if (auth_result) {
            return {
                'apiUser': pair_payload.device_id,
                'apiPass': pair_response.auth_key,
            };
        } else {
            return {};
        } 
    }
}