import { http, HttpHandler, HttpResponse, delay } from 'msw';
import { setupWorker, type SetupWorker } from 'msw/browser';
import type { Request } from 'miragejs';
import type { RouteHandler, ServerConfig } from 'miragejs/server';
import type { AnyFactories, AnyModels, AnyRegistry } from 'miragejs/-types';

type RawHandler = RouteHandler<AnyRegistry> | {};

type ResponseCode = number;

/** code, headers, serialized response */
type ResponseData = [ResponseCode, { [k: string]: string }, string | undefined];

type HTTPVerb =
  | 'get'
  | 'put'
  | 'post'
  | 'patch'
  | 'delete'
  | 'options'
  | 'head';

/** e.g. "/movies/:id" */
type Shorthand = string;

type RouteArgs =
  | [RouteOptions]
  | [Record<string, unknown>, ResponseCode]
  | [Function, ResponseCode]
  | [Shorthand, RouteOptions]
  | [Shorthand, ResponseCode, RouteOptions];

type RouteArguments = [
  RawHandler | undefined,
  ResponseCode | undefined,
  RouteOptions,
];

type BaseHandler = (path: string, ...args: RouteArgs) => void;

type MirageServer = {
  registerRouteHandler: (
    verb: HTTPVerb,
    path: string,
    rawHandler?: RawHandler,
    customizedCode?: ResponseCode,
    options?: unknown
  ) => (request: Request) => ResponseData | PromiseLike<ResponseData>;

  get?: BaseHandler;
  post?: BaseHandler;
  put?: BaseHandler;
  delete?: BaseHandler;
  del?: BaseHandler;
  patch?: BaseHandler;
  head?: BaseHandler;
  options?: BaseHandler;
};

type RouteOptions = {
  /** JSON-api option */
  coalesce?: boolean;
  /**
   * Pretender treats a boolean timing option as "async", number as ms delay.
   * TODO: Not sure what MSW does yet.
   */
  timing?: boolean | number;
};

const defaultRouteOptions = {
  coalesce: false,
  timing: undefined,
} satisfies RouteOptions;

/**
 * Determine if the object contains a valid option.
 *
 * @method isOption
 * @param {Object} option An object with one option value pair.
 * @return {Boolean} True if option is a valid option, false otherwise.
 * @private
 */
function isOption(option: unknown): option is RouteOptions {
  if (!option || typeof option !== 'object') {
    return false;
  }

  let allOptions = Object.keys(defaultRouteOptions);
  let optionKeys = Object.keys(option);
  for (let i = 0; i < optionKeys.length; i++) {
    let key = optionKeys[i];
    if (allOptions.indexOf(key) > -1) {
      return true;
    }
  }
  return false;
}

/**
 * Extract arguments for a route.
 *
 * @method extractRouteArguments
 * @param {Array} args Of the form [options], [object, code], [function, code]
 * [shorthand, options], [shorthand, code, options]
 * @return {Array} [handler (i.e. the function, object or shorthand), code,
 * options].
 */
function extractRouteArguments(args: RouteArgs): RouteArguments {
  let result: RouteArguments = [undefined, undefined, {}];

  for (const arg of args) {
    if (isOption(arg)) {
      result[2] = { ...defaultRouteOptions, ...arg };
    } else if (typeof arg === 'number') {
      result[1] = arg;
    } else {
      result[0] = arg;
    }
  }
  return result;
}

export default class MswConfig {
  urlPrefix?: string;

  namespace?: string;

  timing?: number;

  msw?: SetupWorker;

  mirageServer?: MirageServer;

  // TODO: infer models and factories
  mirageConfig?: ServerConfig<AnyModels, AnyFactories>;

  handlers: HttpHandler[] = [];

  get?: BaseHandler;
  post?: BaseHandler;
  put?: BaseHandler;
  delete?: BaseHandler;
  del?: BaseHandler;
  patch?: BaseHandler;
  head?: BaseHandler;
  options?: BaseHandler;

  create(
    server: MirageServer,
    mirageConfig: ServerConfig<AnyModels, AnyFactories>
  ) {
    this.mirageServer = server;
    this.mirageConfig = mirageConfig;

    this.config(mirageConfig);

    const verbs = [
      ['get'] as const,
      ['post'] as const,
      ['put'] as const,
      ['delete', 'del'] as const,
      ['patch'] as const,
      ['head'] as const,
      ['options'] as const,
    ];

    verbs.forEach(([verb, alias]) => {
      this[verb] = (path: string, ...args: RouteArgs) => {
        let [rawHandler, customizedCode, options] = extractRouteArguments(args);

        // This assertion is for TypeScript, we don't expect it to happen
        if (!this.mirageServer) {
          throw new Error('Lost the mirageServer');
        }

        let handler = this.mirageServer.registerRouteHandler(
          verb,
          path,
          rawHandler,
          customizedCode,
          options
        );
        let fullPath = this._getFullPath(path);
        let mswHandler = http[verb](fullPath, async ({ request, params }) => {
          let queryParams: Record<string, string | string[]> = {};
          const reqUrl = new URL(request.url);
          for (const [paramKey, paramValue] of reqUrl.searchParams.entries()) {
            let newValue: string | string[] = paramValue;
            let newKey = paramKey;
            if (newKey.includes('[]')) {
              newKey = newKey.replace('[]', '');
              newValue = [...(queryParams[newKey] || []), paramValue];
            }
            queryParams[newKey] = newValue;
          }

          // Determine how to process a request body
          let requestBody: string = '';
          const contentType =
            request.headers?.get('content-type')?.toLowerCase() || '';
          const hasJsonContent = contentType.includes('json');
          if (hasJsonContent) {
            requestBody = JSON.stringify(await request.json());
          } else {
            // This will parse multipart as text, which I think will work?  Should be tested
            requestBody = await request.text();
          }
          const requestHeaders: Record<string, string> = {};
          request.headers.forEach((v, k) => {
            requestHeaders[k.toLowerCase()] = v;
          });

          let req: Request = {
            requestBody,
            // @ts-expect-error this is fixed in an unreleased version of miragejs
            queryParams,
            requestHeaders,
            // @ts-expect-error params can be an array, but mirage doesn't expect that
            params,
          };

          let [status, headers, responseBody] = await handler(req);

          if (status === 204) {
            // MirageJS Incorrectly sets the body to "" on a 204.
            responseBody = undefined;
          }

          const init = {
            status,
            headers,
          };

          // Delay the response if needed
          if (this.timing) {
            await delay(this.timing);
          }

          // Return the correct type of response based on the `accept` header
          const accept = request.headers?.get('accept')?.toLowerCase() || '';
          if (accept.includes('json')) {
            return HttpResponse.json(responseBody, init);
          } else if (accept.includes('text')) {
            return HttpResponse.text(responseBody, init);
          } else {
            throw new Error(
              `Mirage-msw: Only json and text responses are supported at this time.  Please open an issue requesting support for ${accept}.`
            );
          }
        });
        if (this.msw) {
          this.msw.use(mswHandler);
        } else {
          this.handlers.push(mswHandler);
        }
      };
      server[verb] = this[verb];

      if (alias) {
        this[alias] = this[verb];
        server[alias] = this[verb];
      }
    });
  }

  // TODO: infer models and factories
  config(mirageConfig: ServerConfig<AnyModels, AnyFactories>) {
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
  _getFullPath(path: string) {
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

    let logging = this.mirageConfig?.logging || false;
    this.msw.start({
      quiet: !logging,
    });
  }

  shutdown() {
    this.msw?.stop();
  }
}
