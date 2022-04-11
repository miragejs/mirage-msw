import { rest, setupWorker } from 'msw';

export default class MswConfig {
  urlPrefix;

  namespace;

  timing;

  msw;

  mirageServer;

  mirageConfig;

  handlers = [];

  create(mirageServer, mirageConfig) {
    this.mirageServer = mirageServer;
    this.mirageConfig = mirageConfig;

    this.config(mirageConfig);

    [
      ['get'],
      ['post'],
      ['put'],
      ['delete', 'del'],
      ['patch'],
      ['head'],
      ['options'],
    ].forEach(([verb, alias]) => {
      this[verb] = (path, ...args) => {
        let handler = mirageServer.registerRouteHandler(verb, path, args);
        let fullPath = this._getFullPath(path);
        let mswHandler = rest[verb](fullPath, async (req, res, ctx) => {
          let queryParams = {};
          req.url.searchParams.forEach((value, key) => {
            queryParams[key] = value;
          });
          let request = Object.assign(
              {
                requestBody:
                    typeof req.body === 'string'
                        ? req.body
                        : JSON.stringify(req.body),
                queryParams: queryParams,
              },
              req
          );
          let [code, headers, response] = await handler(request);
          if (code === 204) {
            // MirageJS Incorrectly sets the body to "" on a 204.
            response = undefined;
          }
          return res(ctx.status(code), ctx.delay(this.timing), (res) => {
            res.body = response;
            Object.entries(headers || {}).forEach(([key, value]) => {
              res.headers.set(key, value);
            });
            return res;
          });
        });
        if (this.msw) {
          this.msw.use(mswHandler);
        } else {
          this.handlers.push(mswHandler);
        }
      };
      mirageServer[verb] = this[verb];

      if (alias) {
        this[alias] = this[verb];
        mirageServer[alias] = this[verb];
      }
    });
  }

  config(mirageConfig) {
    /**
     Sets a string to prefix all route handler URLs with.

     Useful if your app makes API requests to a different port.

     ```js
     createServer({
        routes() {
          this.urlPrefix = 'http://localhost:8080'
        }
      })
     ```
     */
    this.urlPrefix = this.urlPrefix || mirageConfig.urlPrefix || '';

    /**
     Set the base namespace used for all routes defined with `get`, `post`, `put` or `del`.

     For example,

     ```js
     createServer({
        routes() {
          this.namespace = '/api';

          // this route will handle the URL '/api/contacts'
          this.get('/contacts', 'contacts');
        }
      })
     ```

     Note that only routes defined after `this.namespace` are affected. This is useful if you have a few one-off routes that you don't want under your namespace:

     ```js
     createServer({
        routes() {

          // this route handles /auth
          this.get('/auth', function() { ...});

          this.namespace = '/api';
          // this route will handle the URL '/api/contacts'
          this.get('/contacts', 'contacts');
        };
      })
     ```

     If your app is loaded from the filesystem vs. a server (e.g. via Cordova or Electron vs. `localhost` or `https://yourhost.com/`), you will need to explicitly define a namespace. Likely values are `/` (if requests are made with relative paths) or `https://yourhost.com/api/...` (if requests are made to a defined server).

     For a sample implementation leveraging a configured API host & namespace, check out [this issue comment](https://github.com/miragejs/ember-cli-mirage/issues/497#issuecomment-183458721).

     @property namespace
     @type String
     @public
     */
    this.namespace = this.namespace || mirageConfig.namespace || '';
  }

  /**
   * Builds a full path for Pretender to monitor based on the `path` and
   * configured options (`urlPrefix` and `namespace`).
   *
   * @private
   * @hide
   */
  _getFullPath(path) {
    path = path[0] === '/' ? path.slice(1) : path;
    let fullPath = '';
    let urlPrefix = this.urlPrefix ? this.urlPrefix.trim() : '';
    let namespace = '';

    // if there is a urlPrefix and a namespace
    if (this.urlPrefix && this.namespace) {
      if (
          this.namespace[0] === '/' &&
          this.namespace[this.namespace.length - 1] === '/'
      ) {
        namespace = this.namespace
            .substring(0, this.namespace.length - 1)
            .substring(1);
      }

      if (
          this.namespace[0] === '/' &&
          this.namespace[this.namespace.length - 1] !== '/'
      ) {
        namespace = this.namespace.substring(1);
      }

      if (
          this.namespace[0] !== '/' &&
          this.namespace[this.namespace.length - 1] === '/'
      ) {
        namespace = this.namespace.substring(0, this.namespace.length - 1);
      }

      if (
          this.namespace[0] !== '/' &&
          this.namespace[this.namespace.length - 1] !== '/'
      ) {
        namespace = this.namespace;
      }
    }

    // if there is a namespace and no urlPrefix
    if (this.namespace && !this.urlPrefix) {
      if (
          this.namespace[0] === '/' &&
          this.namespace[this.namespace.length - 1] === '/'
      ) {
        namespace = this.namespace.substring(0, this.namespace.length - 1);
      }

      if (
          this.namespace[0] === '/' &&
          this.namespace[this.namespace.length - 1] !== '/'
      ) {
        namespace = this.namespace;
      }

      if (
          this.namespace[0] !== '/' &&
          this.namespace[this.namespace.length - 1] === '/'
      ) {
        let namespaceSub = this.namespace.substring(
            0,
            this.namespace.length - 1
        );
        namespace = `/${namespaceSub}`;
      }

      if (
          this.namespace[0] !== '/' &&
          this.namespace[this.namespace.length - 1] !== '/'
      ) {
        namespace = `/${this.namespace}`;
      }
    }

    // if no namespace
    if (!this.namespace) {
      namespace = '';
    }

    // check to see if path is a FQDN. if so, ignore any urlPrefix/namespace that was set
    if (/^https?:\/\//.test(path)) {
      fullPath += path;
    } else {
      // otherwise, if there is a urlPrefix, use that as the beginning of the path
      if (urlPrefix.length) {
        fullPath +=
            urlPrefix[urlPrefix.length - 1] === '/' ? urlPrefix : `${urlPrefix}/`;
      }

      // add the namespace to the path
      fullPath += namespace;

      // add a trailing slash to the path if it doesn't already contain one
      if (fullPath[fullPath.length - 1] !== '/') {
        fullPath += '/';
      }

      // finally add the configured path
      fullPath += path;

      // if we're making a same-origin request, ensure a / is prepended and
      // dedup any double slashes
      if (!/^https?:\/\//.test(fullPath)) {
        fullPath = `/${fullPath}`;
        fullPath = fullPath.replace(/\/+/g, '/');
      }
    }

    return fullPath;
  }

  start() {
    this.msw = setupWorker(...this.handlers);

    let logging = this.mirageConfig.logging || false;
    this.msw.start({
      quiet: !logging,
    });
  }

  shutdown() {
    this.msw.stop();
  }
}
