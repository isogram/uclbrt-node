import { UserConfig } from 'types';
import * as crypto from 'crypto';
import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import https from 'https';
import qs from 'querystring';
import fs from 'fs';

const LIB_VERSION = '1.0.7';

type ContentType = 'application/x-www-form-urlencoded' | 'application/json';

export class Uclbrt {
  accountSid: string;
  authToken: string;
  apiHost: string;
  cardHost: string;
  debug: boolean;
  communityTimezone: string;
  communityNo: number;
  localTimezone: string;
  publicKey: Buffer | string;

  constructor(config: UserConfig) {
    const defaultConfig: UserConfig = {
      accountSid: '',
      authToken: '',
      apiHost: 'https://api.uclbrt.com/',
      cardHost: 'http://cz.uclbrt.com/',
      debug: false,
    };
    const mergedConfig = { ...defaultConfig, ...config };
    if (!mergedConfig.accountSid) {
      throw new Error('accountSid cannot be empty.');
    }
    this.accountSid = mergedConfig.accountSid;
    if (!mergedConfig.authToken) {
      throw new Error('authToken cannot be empty.');
    }
    this.authToken = mergedConfig.authToken;
    const apiHost = new URL(mergedConfig.apiHost || '');
    if (!apiHost.hostname) {
      throw new Error('apiHost is not a valid domain.');
    }
    this.apiHost = mergedConfig.apiHost || 'https://api.uclbrt.com/';
    const cardHost = new URL(mergedConfig.cardHost || '');
    if (!cardHost.hostname) {
      throw new Error('cardHost is not a valid domain.');
    }
    this.cardHost = mergedConfig.cardHost || 'http://cz.uclbrt.com/';
    this.debug = mergedConfig.debug || false;
    this.communityTimezone = 'Asia/Shanghai';
    this.localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    // load public key from file publicKey.pem using fs
    // get current path of this file
    const currentPath = process.cwd() + '/node_modules/uclbrt-node/resources';
    // get absolute path of publicKey.pem
    const publicKeyPath = `${currentPath}/public.pem`;
    this.publicKey = Buffer.from(fs.readFileSync(publicKeyPath, { encoding: 'utf-8' }));
  }

  protected objectToQuery(data: { [key: string]: any }): string {
    const keys = Object.keys(data);
    keys.sort();
    const sortedData = keys.map((key) => `${key}=${data[key]}`);
    const query = sortedData.join('&');
    return query;
  }

  protected log(...args: any[]) {
    if (!this.debug) {
      return;
    }
    const now = new Date();
    const date = now.toISOString();
    const message = `[uclbrt-node] ${date} ${JSON.stringify(args)}`;
    console.log(message);
  }

  protected getSig(batch: string): string {
    const hash = crypto.createHash('md5');
    hash.update(this.accountSid + this.authToken + batch);
    return hash.digest('hex').toUpperCase();
  }

  protected getSig2(data: { [key: string]: any }): string {
    const imploded = Object.values(data).join('');
    const hash = crypto.createHash('md5');
    hash.update(imploded + this.authToken);
    return hash.digest('hex');
  }

  protected getSig3(data: { [key: string]: any }): string {
    data['authToken'] = this.authToken;
    const query = this.objectToQuery(data);
    const hash = crypto.createHash('sha1');
    hash.update(query);
    return hash.digest('hex');
  }

  protected getAuth(batch: string): string {
    return Buffer.from(`${this.accountSid}:${batch}`).toString('base64');
  }

  // convert above to typescript
  protected getPk(): crypto.KeyObject {
    const pk = crypto.createPublicKey(this.publicKey);
    return pk;
  }

  protected publicEncrypt(data: string): string {
    const encrypted = crypto.publicEncrypt(this.getPk(), Buffer.from(data));
    return encrypted.toString('base64');
  }

  protected toCommunityTime(timeStr: string): string {
    if ('' === timeStr) {
      return '';
    }
    if (this.communityTimezone == this.localTimezone) {
      return timeStr;
    }
    const t = timeStr.match(/.{2}/g);
    if (!t || t.length != 5) {
      throw new Error('time format error.');
    }
    const dt = new Date(`20${t[0]}-${t[1]}-${t[2]} ${t[3]}:${t[4]}:00`);
    const dt2 = new Date(dt.toLocaleString('en-US', { timeZone: this.communityTimezone }));
    return dt2.toISOString().replace(/-|:|T/g, '').slice(2, 12);
  }

  protected checkCommunityNo() {
    if (!this.communityNo) {
      throw new Error('communityNo cannot be empty.');
    }
  }

  protected async curlPost(
    url: string,
    auth: string,
    data: any,
    contentType: ContentType = 'application/x-www-form-urlencoded'
  ): Promise<any> {
    this.log('request url:', url);
    if (!crypto.createHash) {
      throw new Error('cURL functions are not available.');
    }

    const headers: { [key: string]: string } = {
      Accept: 'application/json',
      'Content-Type': contentType,
      'User-Agent': 'uclbrt-nodejs/' + LIB_VERSION,
    };

    if (auth) {
      headers['Authorization'] = auth;
      this.log('request auth:', auth);
    }

    const config: AxiosRequestConfig = {
      method: 'post',
      url: url,
      headers,
      ...(contentType === 'application/json' && {
        data: data || undefined,
      }),
      ...(contentType === 'application/x-www-form-urlencoded' && {
        data: data ? qs.stringify(data) : undefined,
      }),
      maxRedirects: 3,
      timeout: 0,
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    };

    this.log('request data:', data);

    try {
      const response: AxiosResponse = await axios(config);

      this.log('server return:', response.data);

      if (response.status !== 200) {
        throw new Error(response.data);
      }

      const result = response.data;

      if (!result || result.status !== 200) {
        throw new Error(result.info);
      }

      return result;
    } catch (error: any) {
      throw new Error(error.response?.data || error.message);
    }
  }

  setCommunityNo(communityNo: number): void {
    if (!communityNo) {
      throw new Error('communityNo cannot be empty.');
    }
    this.communityNo = communityNo;
  }

  // convert above to typescript
  setCommunityTimezone(communityTimezone: string): void {
    if (!communityTimezone) {
      throw new Error('communityTimezone cannot be empty.');
    }
    this.communityTimezone = communityTimezone;
  }

  setLocalTimezone(localTimezone: string): void {
    if (!localTimezone) {
      throw new Error('localTimezone cannot be empty.');
    }
    this.localTimezone = localTimezone;
  }

  async create(
    mobile: string,
    areaCode: string,
    roomNo: string,
    floorNo: string = '',
    buildNo: string = '',
    startTime: string = '',
    endTime: string = '',
    sendSms: number = 0,
    cardType: number = 0,
    times: number = 0,
    opentype: number = 0
  ): Promise<string> {
    this.log('called create');
    this.checkCommunityNo();
    const batch = new Date().toISOString().replace(/-|:|T/g, '').slice(0, 14);
    const sig = this.getSig(batch);
    const url = `${this.apiHost}?c=Qrcode&a=getLink&sig=${sig}`;
    const auth = this.getAuth(batch);
    const data = {
      mobile,
      areaCode,
      roomNo,
      floorNo,
      buildNo,
      communityNo: this.communityNo.toString(),
      startTime: this.toCommunityTime(startTime),
      endTime: this.toCommunityTime(endTime),
      sendSms,
      cardType,
      times,
      opentype,
    };
    return this.curlPost(url, auth, data, 'application/json').then((result) => {
      if (!result.cardNo) {
        throw new Error('the cardNo is not found in the return result of the server.');
      }
      return result.cardNo;
    });
  }

  async createRoomKey(
    mobile: string,
    areaCode: string,
    roomNo: string,
    floorNo: string = '',
    buildNo: string = '',
    startTime: string = '',
    endTime: string = '',
    sendSms: number = 0,
    times: number = 0
  ): Promise<string> {
    this.log('called createRoomKey');
    return this.create(mobile, areaCode, roomNo, floorNo, buildNo, startTime, endTime, sendSms, 0, times);
  }

  async createFloorKey(
    mobile: string,
    areaCode: string,
    floorNo: string,
    buildNo: string,
    startTime: string = '',
    endTime: string = '',
    sendSms: number = 0
  ): Promise<string> {
    this.log('called createFloorKey');
    return this.create(mobile, areaCode, '', floorNo, buildNo, startTime, endTime, sendSms, 1);
  }

  async createBuildingKey(
    mobile: string,
    areaCode: string,
    buildNo: string,
    startTime: string = '',
    endTime: string = '',
    sendSms: number = 0
  ): Promise<string> {
    this.log('called createBuildingKey');
    return this.create(mobile, areaCode, '', '', buildNo, startTime, endTime, sendSms, 2);
  }

  async createRoomLostKey(
    mobile: string,
    areaCode: string,
    roomNo: string,
    floorNo: string = '',
    buildNo: string = '',
    startTime: string = '',
    endTime: string = ''
  ): Promise<string> {
    this.log('called createRoomLostKey');
    this.checkCommunityNo();
    const batch = new Date().toISOString().replace(/-|:|T/g, '').slice(0, 14);
    const sig = this.getSig(batch);
    const url = `${this.apiHost}?c=Qrcode&a=getLink&sig=${sig}`;
    const auth = this.getAuth(batch);
    const data = {
      mobile,
      areaCode,
      roomNo,
      floorNo,
      buildNo,
      communityNo: this.communityNo.toString(),
      startTime: this.toCommunityTime(startTime),
      endTime: this.toCommunityTime(endTime),
      cardType: 0,
      times: 0,
      isLost: 1,
    };
    return this.curlPost(url, auth, data, 'application/json').then((result) => {
      if (!result.cardNo) {
        throw new Error('the cardNo is not found in the return result of the server.');
      }
      return result.cardNo;
    });
  }

  async generateQRPRoomCipher(
    mobile: string,
    areaCode: string,
    roomNo: string,
    floorNo: string = '',
    buildNo: string = '',
    startTime: string = '',
    endTime: string = '',
    cipherType: number = 1
  ): Promise<string> {
    this.log('called create qrp room cipher');
    this.checkCommunityNo();
    const batch = new Date().toISOString().replace(/-|:|T/g, '').slice(0, 14);
    const sig = this.getSig(batch);
    const url = `${this.apiHost}?c=Qrcode&a=getLink&sig=${sig}`;
    const auth = this.getAuth(batch);
    const startTimeFull = this.toCommunityTime(startTime);
    const endTimeFull = this.toCommunityTime(endTime);
    const startTimeHour = startTimeFull.slice(0, -2) + '00';
    const endTimeHour = endTimeFull.slice(0, -2) + '00';
    const data = {
      mobile,
      areaCode,
      roomNo,
      floorNo,
      buildNo,
      communityNo: this.communityNo.toString(),
      startTime: startTimeHour,
      endTime: endTimeHour,
      cipherType,
    };
    return this.curlPost(url, auth, data, 'application/json').then((result) => {
      if (!result.cardNo) {
        throw new Error('the cardNo is not found in the return result of the server.');
      }
      return result.cardNo;
    });
  }

  async reportCardLost(cardNo: string, wholeRoom: boolean = false): Promise<boolean> {
    this.log('called create room lost key');
    this.checkCommunityNo();
    const batch = new Date().toISOString().replace(/-|:|T/g, '').slice(0, 14);
    const sig = this.getSig(batch);
    const url = `${this.apiHost}?c=Qrcode&a=reportLost&sig=${sig}`;
    const auth = this.getAuth(batch);
    const data = {
      cardNo,
      wholeRoom: wholeRoom ? 1 : 0,
    };
    return this.curlPost(url, auth, data, 'application/json').then((result) => {
      if (!result.status || result.status != 200) {
        throw new Error(result.info);
      }
      return true;
    });
  }

  async getLink(mobile: string, areaCode: string, cardNo: string = '', cardType: number = 0): Promise<string> {
    this.log('called getLink');
    if (!mobile) {
      throw new Error('mobile cannot be empty.');
    }
    this.checkCommunityNo();
    const data = {
      id: this.accountSid,
      token: this.authToken,
      communityNo: this.communityNo.toString(),
      time: Math.floor(Date.now() / 1000),
      mobile,
      areaCode,
      cardNo,
      cardType,
    };

    try {
      const query = this.objectToQuery(data);
      const encrypted = this.publicEncrypt(query);
      const link = `${this.cardHost}apiLogin/?data=${encodeURIComponent(encrypted)}`;
      this.log('got link:', link);
      return link;
    } catch (error: any) {
      this.log('error:', error);
      throw new Error('failed to generate link.');
    }
  }

  async getRoomKeyLink(mobile: string, areaCode: string, cardNo: string = ''): Promise<string> {
    this.log('called getRoomKeyLink');
    return this.getLink(mobile, areaCode, cardNo, 0);
  }

  async getFloorKeyLink(mobile: string, areaCode: string, cardNo: string = ''): Promise<string> {
    this.log('called getFloorKeyLink');
    return this.getLink(mobile, areaCode, cardNo, 1);
  }

  async getBuildingKeyLink(mobile: string, areaCode: string, cardNo: string = ''): Promise<string> {
    this.log('called getBuildingKeyLink');
    return this.getLink(mobile, areaCode, cardNo, 2);
  }

  async getShare(
    mobile: string,
    areaCode: string,
    roomFlag: string,
    cardType: number = 0,
    openEndTime: string = '',
    lockType: number = 0,
    resultType: number = 1
  ): Promise<any> {
    this.log('called getShare');
    this.checkCommunityNo();
    const batch = new Date().toISOString().replace(/-|:|T/g, '').slice(0, 14);
    const sig = this.getSig(batch);
    const url = `${this.apiHost}?c=Qrcode&a=getCard&sig=${sig}`;
    const auth = this.getAuth(batch);
    const data = {
      mobile,
      areaCode,
      communityNo: this.communityNo.toString(),
      roomFlag,
      cardType,
      lockType,
      resultType,
      openEndTime: this.toCommunityTime(openEndTime),
    };
    return this.curlPost(url, auth, data, 'application/json');
  }

  async getRoomKeyImage(
    mobile: string,
    areaCode: string,
    cardNo: string,
    openEndTime: string = '',
    lockType: number = 0
  ): Promise<string> {
    this.log('called getRoomKeyImage');
    const result = await this.getShare(mobile, areaCode, cardNo, 0, openEndTime, lockType, 1);
    if (!result.baseImg) {
      throw new Error('the baseImg is not found in the return result of the server.');
    }
    return result.baseImg;
  }

  async getFloorKeyImage(
    mobile: string,
    areaCode: string,
    cardNo: string,
    openEndTime: string = '',
    lockType: number = 0
  ): Promise<string> {
    this.log('called getFloorKeyImage');
    const result = await this.getShare(mobile, areaCode, cardNo, 1, openEndTime, lockType, 1);
    if (!result.baseImg) {
      throw new Error('the baseImg is not found in the return result of the server.');
    }
    return result.baseImg;
  }

  async getBuildingKeyImage(
    mobile: string,
    areaCode: string,
    cardNo: string,
    openEndTime: string = '',
    lockType: number = 0
  ): Promise<string> {
    this.log('called getBuildingKeyImage');
    const result = await this.getShare(mobile, areaCode, cardNo, 2, openEndTime, lockType, 1);
    if (!result.baseImg) {
      throw new Error('the baseImg is not found in the return result of the server.');
    }
    return result.baseImg;
  }

  async getRoomKeyString(mobile: string, areaCode: string, mac: string): Promise<string> {
    this.log('called getRoomKeyString');
    const result = await this.getShare(mobile, areaCode, mac, 0, '', 0, 2);
    if (!result.bleStr) {
      throw new Error('the bleStr is not found in the return result of the server.');
    }
    return result.bleStr;
  }

  async getQRPRoomCipher(mobile: string, areaCode: string, cardNo: string): Promise<string> {
    this.log('called getQRPRoomCipher');
    const result = await this.getShare(mobile, areaCode, cardNo, 0, '', 0, 4);
    if (!result.cipher) {
      throw new Error('the cipher is not found in the return result of the server.');
    }
    return result.cipher;
  }

  async cancel(cardNo: string, cardType: number = 0): Promise<boolean> {
    this.log('called cancel');
    this.checkCommunityNo();
    const batch = new Date().toISOString().replace(/-|:|T/g, '').slice(0, 14);
    const sig = this.getSig(batch);
    const url = `${this.apiHost}?c=Qrcode&a=cancelCard&sig=${sig}`;
    const auth = this.getAuth(batch);
    const data = {
      cardNo,
      cardType,
    };
    return this.curlPost(url, auth, data, 'application/json').then((result) => {
      if (!result.info || result.info != 'success') {
        throw new Error('server returns an unexpected value.');
      }
      return true;
    });
  }

  async cancelRoomKey(cardNo: string): Promise<boolean> {
    this.log('called cancelRoomKey');
    return this.cancel(cardNo, 0);
  }

  async cancelFloorKey(cardNo: string): Promise<boolean> {
    this.log('called cancelFloorKey');
    return this.cancel(cardNo, 1);
  }

  async cancelBuildingKey(cardNo: string): Promise<boolean> {
    this.log('called cancelBuildingKey');
    return this.cancel(cardNo, 2);
  }

  async getMacList(): Promise<any> {
    this.log('called getMacList');
    this.checkCommunityNo();
    const url = `${this.apiHost}Home/Qrm/getMacList`;
    const data: any = {
      accountSid: this.accountSid,
      communityNo: this.communityNo.toString(),
    };
    data['sig'] = this.getSig2(data);
    return this.curlPost(url, '', data).then((result) => {
      // if(!result.data || !Array.isArray(result.data))
      if (!result.data) {
        throw new Error('server returns an unexpected value.');
      }
      return result.data;
    });
  }

  async makeCard(
    issueMac: string,
    buildNo: string,
    floorNo: string,
    roomNo: string,
    endTime: string,
    creatorAreaCode: string,
    creatorMobile: string,
    creatorPassword: string,
    owner: string = '',
    opentype: number = 0,
    ownerGender: number = 1,
    ownerAreaCode: string = '',
    ownerMobile: string = '',
    creatorEmail: string = ''
  ): Promise<boolean> {
    this.log('called makeCard');
    this.checkCommunityNo();
    const url = `${this.apiHost}Home/Qrm/makeRoomCard`;
    const data: any = {
      issueMac,
      endTime: this.toCommunityTime(endTime),
      accountSid: this.accountSid,
      communityNo: this.communityNo.toString(),
      buildNo,
      floorNo,
      roomNo,
    };
    data['sig'] = this.getSig2(data);
    data['owner'] = owner;
    data['creatorAreaCode'] = creatorAreaCode;
    data['creatorMobile'] = creatorMobile;
    // generate md5 hash form creatorPassword
    const hash = crypto.createHash('md5');
    hash.update(creatorPassword);
    data['creatorPassword'] = hash.digest('hex');
    data['opentype'] = opentype;
    data['ownerGender'] = ownerGender;
    data['ownerAreaCode'] = ownerAreaCode;
    data['ownerMobile'] = ownerMobile;
    data['creatorEmail'] = creatorEmail;
    return this.curlPost(url, '', data).then((result) => {
      if (!result.info || result.info != 'success') {
        throw new Error('server returns an unexpected value.');
      }
      return true;
    });
  }

  async makeLostCard(
    issueMac: string,
    buildNo: string,
    floorNo: string,
    roomNo: string,
    endTime: string,
    creatorAreaCode: string,
    creatorMobile: string,
    creatorPassword: string,
    owner: string = '',
    opentype: number = 0,
    ownerGender: number = 1,
    ownerAreaCode: string = '',
    ownerMobile: string = '',
    creatorEmail: string = ''
  ): Promise<boolean> {
    this.log('called makeLostCard');
    this.checkCommunityNo();
    const url = `${this.apiHost}Home/Qrm/makeRoomCard`;
    const data: any = {
      issueMac,
      endTime: this.toCommunityTime(endTime),
      accountSid: this.accountSid,
      communityNo: this.communityNo.toString(),
      buildNo,
      floorNo,
      roomNo,
    };
    data['sig'] = this.getSig2(data);
    data['owner'] = owner;
    data['creatorAreaCode'] = creatorAreaCode;
    data['creatorMobile'] = creatorMobile;
    // generate md5 hash form creatorPassword
    const hash = crypto.createHash('md5');
    hash.update(creatorPassword);
    data['creatorPassword'] = hash.digest('hex');
    data['opentype'] = opentype;
    data['ownerGender'] = ownerGender;
    data['ownerAreaCode'] = ownerAreaCode;
    data['ownerMobile'] = ownerMobile;
    data['creatorEmail'] = creatorEmail;
    data['isLost'] = creatorEmail;
    return this.curlPost(url, '', data).then((result) => {
      if (!result.info || result.info != 'success') {
        throw new Error('server returns an unexpected value.');
      }
      return true;
    });
  }

  async readCard(
    issueMac: string,
    creatorAreaCode: string,
    creatorMobile: string,
    creatorPassword: string,
    operateCardType: number,
    creatorEmail: string = ''
  ): Promise<any> {
    this.log('called readCard');
    this.checkCommunityNo();
    const url = `${this.apiHost}Home/Qrm/readCard`;
    // generate md5 hash form creatorPassword
    const hash = crypto.createHash('md5');
    hash.update(creatorPassword);
    const data: any = {
      accountSid: this.accountSid,
      communityNo: this.communityNo.toString(),
      issueMac,
      creatorAreaCode,
      creatorMobile,
      creatorPassword: hash.digest('hex'),
    };
    data['sig'] = this.getSig2(data);
    data['operateCardType'] = operateCardType;
    data['creatorEmail'] = creatorEmail;
    return this.curlPost(url, '', data).then((result) => {
      if (!result.info || result.info != 'success') {
        throw new Error('server returns an unexpected value.');
      }
      return result;
    });
  }

  async cancelCard(
    issueMac: string,
    serialNum: string,
    creatorAreaCode: string,
    creatorMobile: string,
    creatorPassword: string,
    operateCardType: number,
    creatorEmail: string = ''
  ): Promise<any> {
    this.log('called cancelCard');
    this.checkCommunityNo();
    const url = `${this.apiHost}Home/Qrm/cancelCard`;
    // generate md5 hash form creatorPassword
    const hash = crypto.createHash('md5');
    hash.update(creatorPassword);
    const data: any = {
      accountSid: this.accountSid,
      communityNo: this.communityNo.toString(),
      issueMac,
      serialNum,
      creatorAreaCode,
      creatorMobile,
      creatorPassword: hash.digest('hex'),
    };
    data['sig'] = this.getSig2(data);
    data['operateCardType'] = operateCardType;
    data['creatorEmail'] = creatorEmail;
    return this.curlPost(url, '', data).then((result) => {
      if (!result.info || result.info != 'success') {
        throw new Error('server returns an unexpected value.');
      }
      return result;
    });
  }

  async getRoomCardInfo(cardString: string): Promise<any> {
    this.log('called getRoomCardInfo');
    const batch = new Date().toISOString().replace(/-|:|T/g, '').slice(0, 14);
    const sig = this.getSig(batch);
    const url = `${this.apiHost}?c=Qrcode&a=getRoomCardInfo&sig=${sig}`;
    const auth = this.getAuth(batch);
    const data = {
      communityNo: this.communityNo.toString(),
      cardString,
    };
    return this.curlPost(url, auth, data, 'application/json').then((result) => {
      if (!result.info || result.info != 'success') {
        throw new Error('server returns an unexpected value.');
      }
      return result.data;
    });
  }

  async getRecordsByRoom(
    buildNo: string,
    floorNo: string,
    roomNo: string,
    startDate: string,
    endDate: string,
    recordType: number = 0,
    holderFrom: number = 0
  ): Promise<any> {
    this.log('called getRecordsByRoom');
    const data: any = {
      accountSid: this.accountSid,
      timestamp: Math.floor(Date.now() / 1000),
      rand: Math.floor(Math.random() * 100000000),
      communityNo: this.communityNo.toString(),
      buildNo,
      floorNo,
      roomNo,
      startDate,
      endDate,
      recordType,
      holderFrom,
    };
    const sig = this.getSig3(data);
    const url = `${this.apiHost}Home/Records/queryByRoom?sig=${sig}`;
    return this.curlPost(url, '', data).then((result) => {
      if (!result.data) {
        throw new Error('server returns an unexpected value.');
      }
      return result.data;
    });
  }

  async fetchRoomInfo(): Promise<any> {
    this.log('called fetchRoomInfo');
    const data: any = {
      accountSid: this.accountSid,
      timestamp: Math.floor(Date.now() / 1000),
      communityNo: this.communityNo.toString(),
    };
    const sig = this.getSig3(data);
    const url = `${this.apiHost}Home/Records/fetchRoomInfo?sig=${sig}`;
    return this.curlPost(url, '', data).then((result) => {
      if (!result.data) {
        throw new Error('server returns an unexpected value.');
      }
      return result.data;
    });
  }

  async getBoxInfo(): Promise<any> {
    this.log('called getBoxInfo');
    const data: any = {
      accountSid: this.accountSid,
      timestamp: Math.floor(Date.now() / 1000),
      communityNo: this.communityNo.toString(),
    };
    const sig = this.getSig3(data);
    const url = `${this.apiHost}Home/Records/getBoxInfo?sig=${sig}`;
    return this.curlPost(url, '', data).then((result) => {
      if (!result.data) {
        throw new Error('server returns an unexpected value.');
      }
      return result.data;
    });
  }
}
