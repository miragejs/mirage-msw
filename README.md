# Mirage-MSW

Experimental [MirageJS](https://miragejs.com/) interceptor using [MSW](https://mswjs.io/).

## Usage

### Installation

Pick one depending on your package manager:

```shell
npm i --save-dev mirage-msw
pnpm i --save-dev mirage-msw
yarn add --dev mirage-msw
```

If you are not already using MSW or Mirage, you will need to install those as well. Be sure to run [`msw init`](https://mswjs.io/docs/integrations/browser#copy-the-worker-script) as well.

We currently only support MSW v1, though we are exploring v2 support: https://github.com/miragejs/mirage-msw/pull/12

### Configuration

Wherever you are creating your miragejs server, set the interceptor:

```ts
import MSWInterceptor from 'mirage-msw';
import { createServer } from 'miragejs';

createServer({
  interceptor: new MSWInterceptor(),
  // ... rest of your config
});
```

This will cause msw to be used instead of the default interceptor, [pretender](https://github.com/pretenderjs/pretender).

## Caveats

This is very early, experimental software. There are probably a lot of bugs, so if you find one, please report it.

Here are the known issues so far:

- [ ] MSW starts up asynchronously, whereas Mirage up to now has always been completely synchronous. We will probably need to make a breaking change to Mirage to make `createServer` an async function.
- [ ] Currently no support for FormData requests.
- [ ] Only works in the browser, same as pretender. But MSW does have an option for node.js, so we may be able to support that in the future.
