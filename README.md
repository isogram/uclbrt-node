# uclbrt node SDK

NodeJS SDK for the UCLBRT API (https://uclbrt.com). This SDK replicate the logic from the official PHP SDK (https://packagist.org/packages/uclbrt/api-sdk)

## Installation

```bash
npm install uclbrt-node
```

## Usage

```javascript
import { Uclbrt, UserConfig } from 'uclbrt-node';

const uclbrtConfig: UserConfig = {
  accountSid: 'xxxxx',
  authToken: 'xxxx',
};
const uclbrt = new Uclbrt(uclbrtConfig);
uclbrt.setCommunityNo(123456789);

const res = await uclbrt.fetchRoomInfo();
console.log(res);
```
