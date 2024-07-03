import wol from 'wake_on_lan';

import { get, post } from './requestHelpers';
import { prepareAuthenticationRequestPayload } from './cmds/auth';
import { createUniquePairRequestPayload } from './cmds/pair';

const validate = {
    mac: /^([0-9A-F]{2}[:-]){5}([0-9A-F]{2})$/,
    // eslint-disable-next-line
    ip: /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/,
    pin: /^[0-9]{4}$/,
};

export interface PhilipsTVConfig {
    apiVersion: number;
    wakeUntilAPIReadyCounter: number;
    broadcastIP: string;
    wakeOnLanRequests: number;
    wakeOnLanTimeout: number;
}

export interface Authentication {
    user: string;
    pass: string;
    sendImmediately: boolean;
}

export class PhilipsTVChannels {
    public channels : Channel[] = [];
    
    reloadChannels(listChannels: string) {
        const channels = JSON.parse(listChannels);

        this.channels = [];

        for (const channel of channels.Channel) {
            this.channels.push({
                ccid: channel.ccid, name: channel.name, object: channel,
            });
        }
    }

    getObjectByName(name: string) : Record<string, string> {
        for (const channel of this.channels) {
            if (channel.name === name) {
                return channel.object;
            }
        }
        return {};
    }

    getNameByCcid(ccid: string) : string {
        for (const channel of this.channels) {
            if (channel.ccid === ccid) {
                return channel.name;
            }
        }
        return '';
    }
    
    getObjectByCcid(ccid: string) : Record<string, string> {
        for (const channel of this.channels) {
            if (channel.ccid === ccid) {
                return channel.object;
            }
        }
        return {};
    }
}

export class PhilipsTV {
    private ip: string;
    private mac?: string;
    private auth?: Authentication;
    private config: PhilipsTVConfig;
    private volume?: number;
    private volumeMin = 0;
    private volumeMax = 0;
    public tvChannels: PhilipsTVChannels;
    
    constructor(ip: string, mac?: string, auth?: Authentication, config?: PhilipsTVConfig) {
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

        if (config) {
            this.config = config;
        } else {
            this.config = {
                wakeUntilAPIReadyCounter: 100,
                apiVersion: 6,
                broadcastIP: '255.255.255.255',
                wakeOnLanRequests: 1,
                wakeOnLanTimeout: 1000,
            };
        }

        this.tvChannels = new PhilipsTVChannels;
    }

    async info() : Promise<Record<string, unknown>> {
        const url = 'http://' + this.ip + ':1925/' + String(this.config.apiVersion) + '/system';
        const result = await get(url);
        const response = JSON.parse(result);
        return response;
    }

    async requestPair() : Promise<Record<string, unknown>> {
        const pair_url = 'https://' + this.ip + ':1926/' + String(this.config.apiVersion) + '/pair/request';
        const pair_payload = createUniquePairRequestPayload();
        const pair_result = await post(pair_url, JSON.stringify(pair_payload));
        const pair_response = JSON.parse(pair_result);

        this.auth = {
            user: pair_payload.device_id,
            pass: pair_response.auth_key,
            sendImmediately: false,
        };

        return pair_response;
    }

    async authorizePair(timestamp: string, pin: string) : Promise<Record<string, unknown>> {
        const auth_url = 'https://' + this.ip + ':1926/' + String(this.config.apiVersion) + '/pair/grant';
        const auth_payload = prepareAuthenticationRequestPayload(
            timestamp,
            pin,
            this.auth!.user,
            this.auth!.pass,
        );

        await post(auth_url, JSON.stringify(auth_payload), this.auth);

        return {
            'apiUser': this.auth!.user,
            'apiPass': this.auth!.pass,
        };
    }

    async pair(pinCallback: () => Promise<string>) {
        const pair_response = await this.requestPair();
        const pin = await pinCallback();
        const auth_response = await this.authorizePair(pair_response.timestamp as string, pin);
        
        return auth_response;
    }

    async wakeOnLan() {
        if (this.mac) {
            for (let i = 0; i < this.config.wakeOnLanRequests; i++) {
                wol.wake(this.mac, { address: this.config.broadcastIP }, function (this, error) {
                    if (error) {
                        console.log('wakeOnLan: error: ' + error);
                    }
                }.bind(this));
            }
            return await new Promise(resolve => setTimeout(resolve, this.config.wakeOnLanTimeout));
        }
    }

    async getPowerStateWithTimeout() {
        const url = 'https://' + this.ip + ':1926/' + String(this.config.apiVersion) + '/powerstate';
    
        const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), this.config.wakeOnLanTimeout));
        const request = get(url, '', this.auth!);
        
        try {
            const result = await Promise.race([request, timeout]);
            return JSON.parse(result as string);
        } catch (error) {
            console.log('Fehler oder Timeout beim Abrufen des PowerState:', error);
            return { powerstate: 'Off' };
        }
    }

    async getPowerState() {
        const url = 'https://' + this.ip + ':1926/' + String(this.config.apiVersion) + '/powerstate';
        // eslint-disable-next-line quotes
        const result = await get(url, '', this.auth!);
        return JSON.parse(result);
    }

    async setPowerState(on: boolean) {
        const url = 'https://' + this.ip + ':1926/' + String(this.config.apiVersion) + '/powerstate';
        let request_body = { 'powerstate': 'Standby'};

        if (on) {
            request_body = { 'powerstate': 'On' };
        } 

        await post(url, JSON.stringify(request_body), this.auth!);
        return;
    }

    async getAmbilightState() {
        
        const url = 'https://' + this.ip + ':1926/' + String(this.config.apiVersion) + '/ambilight/power';
        // eslint-disable-next-line quotes
        const result = await get(url, '', this.auth!);
        return JSON.parse(result);
    }

    async setAmbilightState(on: boolean) {
        const url = 'https://' + this.ip + ':1926/' + String(this.config.apiVersion) + '/ambilight/power';
        let request_body = { 'power': 'Off'};

        if (on) {
            request_body = { 'power': 'On' };
        } 

        await post(url, JSON.stringify(request_body), this.auth!);
        return;
    }


    async getAmbilightHueState() {
        
        const url = 'https://' + this.ip + ':1926/' + String(this.config.apiVersion) + '/HueLamp/power';
        // eslint-disable-next-line quotes
        const result = await get(url, '', this.auth!);
        return JSON.parse(result);
    }

    async setAmbilightHueState(on: boolean) {
        const url = 'https://' + this.ip + ':1926/' + String(this.config.apiVersion) + '/HueLamp/power';
        let request_body = { 'power': 'Off'};

        if (on) {
            request_body = { 'power': 'On' };
        } 

        await post(url, JSON.stringify(request_body), this.auth!);
        return;
    }

    async getApplications() {
        const url = 'https://' + this.ip + ':1926/' + String(this.config.apiVersion) + '/applications';
        const result = await get(url, '', this.auth!);
        return JSON.parse(result);
    }

    async getCurrentActivity() {
        const url = 'https://' + this.ip + ':1926/' + String(this.config.apiVersion) + '/activities/current';
        const result = await get(url, '', this.auth!);
        return JSON.parse(result);
    }

    async getCurrentTVChannel() {
        const url = 'https://' + this.ip + ':1926/' + String(this.config.apiVersion) + '/activities/tv';
        const result = await get(url, '', this.auth!);
        return JSON.parse(result);
    }

    async getFavoriteList(favoriteListId: number) {
        const url = 'https://' + this.ip + ':1926/' + String(this.config.apiVersion)
            + '/channeldb/tv/favoriteLists/' + String(favoriteListId);
        const result = await get(url, '', this.auth!);
        return JSON.parse(result);       
    }

    async getTVChannels() {
        const url = 'https://' + this.ip + ':1926/' + String(this.config.apiVersion) + '/channeldb/tv/channelLists/all';
        const result = await get(url, '', this.auth!);
        return JSON.parse(result);
    }

    async getVolume() {
        const url = 'https://' + this.ip + ':1926/' + String(this.config.apiVersion) + '/audio/volume';
        const result = await get(url, '', this.auth!);
        const response = JSON.parse(result);    
        this.volume = response.current;
        this.volumeMax = response.max;
        this.volumeMin = response.min;
        return response;
    }

    async getVolumePercentage() {
        const result = await this.getVolume();
        return Math.floor(Number(result.current) * (100 / (result.max - result.min)));
    }

    async setVolume(value: number) {
        const url = 'https://' + this.ip + ':1926/' + String(this.config.apiVersion) + '/audio/volume';
        const request_body = { 'muted': false, 'current': value };
        this.volume = value;
        const result = await post(url, JSON.stringify(request_body), this.auth!);
        return JSON.parse(result);    
    }

    async setVolumePercentage(percentage: number) {
        const result = await this.setVolume(Math.floor((Number(percentage) * (this.volumeMax - this.volumeMin)) / 100));
        return result;
    }

    async setMute(muted: boolean) {
        const url = 'https://' + this.ip + ':1926/' + String(this.config.apiVersion) + '/audio/volume';
        const request_body = { 'muted': muted, 'current': this.volume };
        const result = await post(url, JSON.stringify(request_body), this.auth!);
        return JSON.parse(result);    
    }

    async sendKey(key: string) {
        const url = 'https://' + this.ip + ':1926/' + String(this.config.apiVersion) + '/input/key';
        const request_body = { 'key': key };
        const result = await post(url, JSON.stringify(request_body), this.auth!);
        return JSON.parse(result);   
    }

    async launchApplication(application: Record<string, string>) {
        const url = 'https://' + this.ip + ':1926/' + String(this.config.apiVersion) + '/activities/launch';
        const result = await post(url, JSON.stringify(application), this.auth!);
        return JSON.parse(result);   
    }

    async launchTVChannel(application: Record<string, string>) {
        const url = 'https://' + this.ip + ':1926/' + String(this.config.apiVersion) + '/activities/tv';
        const result = await post(url, JSON.stringify(application), this.auth!);
        return JSON.parse(result); 
    }

    async turnOn(counter = 0) {
        while (counter < this.config.wakeUntilAPIReadyCounter) {
            counter++;
            if ((counter % 10) === 0) {
                console.log('turnOn: try ' + counter);
            }
            try {
                await this.setPowerState(true);
                return;
            } catch {
                await this.wakeOnLan();
            }
        }
    }

    async wakeUntilAPIReady(counter = 0) {
        while (counter < this.config.wakeUntilAPIReadyCounter) {
            counter++;
            if ((counter % 10) === 0) {
                console.log('wakeUntilAPIReady: try ' + counter);
            }
            try {
                const result = await this.getPowerState();
                return result;
            } catch {
                await this.wakeOnLan();
            }
        }
    }
}


interface Channel {
    ccid: string;
    name: string;
    object: Record<string, string>;
}
