# Mirage-MSW

Experimental [MirageJS](https://miragejs.com/) interceptor using [MSW](https://mswjs.io/).

## Usage

### Installation

Pick one depending on your package manager. Mirage `0.2.0-alpha.3+` and MSW `2.0.0+` are peer dependencies.

```shell
npm i --save-dev mirage-msw mirage@^0.2.0-alpha.3 msw@^2
pnpm i --save-dev mirage-msw mirage@^0.2.0-alpha.3 msw@^2
yarn add --dev mirage-msw mirage@^0.2.0-alpha.3 msw@^2
```

Be sure to run [`msw init`](https://mswjs.io/docs/integrations/browser#copy-the-worker-script) as well, if you haven't previously.

### Configuration

Wherever you are creating your miragejs server, set the interceptor:

```ts
import MSWInterceptor from 'mirage-msw';
import { createServer } from 'miragejs';

const server = createServer({
  interceptor: new MSWInterceptor(),
  // ... rest of your config
});

// Important to wait for msw to start up before rendering your app
await server.start();
```

This will cause msw to be used instead of the default interceptor, [pretender](https://github.com/pretenderjs/pretender).

## Caveats

This is very early, experimental software. There are probably a lot of bugs, so if you find one, please report it.

Here are the known issues so far:

- [x] MSW starts up asynchronously, whereas Mirage up to now has always been completely synchronous. We will probably need to make a breaking change to Mirage to make `createServer` an async function. (Added in mirage 0.2.0-alpha.1)
- [ ] Currently no support for FormData requests.
- [ ] Only works in the browser, same as pretender. But MSW does have an option for node.js, so we may be able to support that in the future. (https://github.com/miragejs/mirage-msw/issues/17)
