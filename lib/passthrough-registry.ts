import RouteRecognizer from 'route-recognizer';
import type { HTTPVerb } from 'miragejs/server';

const noOpHandler = () => {};
const allVerbs = ['GET', 'PUT', 'POST', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];

/**
 * Registry
 *
 * A registry is a map of HTTP verbs to route recognizers.
 */
const createPassthroughRegistry = (path: string, verbs: HTTPVerb[]) => {
  const registry = new Map();

  const uppercaseUserVerbs = verbs.map((v) => v.toUpperCase());

  const matchingVerbs = allVerbs.filter((v) => {
    // If the user didn't specify verbs, then use everything
    if (!verbs || !Array.isArray(verbs) || verbs.length === 0) return true;

    return uppercaseUserVerbs.includes(v);
  });

  matchingVerbs.forEach((mv) => {
    const recognizer = new RouteRecognizer();
    recognizer.add([{ path, handler: noOpHandler }]);
    registry.set(mv, recognizer);
  });

  return registry;
};

/**
 * Hosts
 *
 * a map of hosts to Registries, ultimately allowing
 * a per-host-and-port, per HTTP verb lookup of RouteRecognizers
 */
export default class PassthroughRegistry {
  registries: Map<string, Map<string, RouteRecognizer>>;

  constructor() {
    this.registries = new Map();
    return this;
  }

  /**
   * Hosts#forURL - retrieve a map of HTTP verbs to RouteRecognizers
   *                for a given URL
   *
   * @param  {String} url a URL
   * @param  {String[]} verbs a list of HTTP verbs to passthrough.  Defaults to all verbs if not specified.
   * @return {Registry}   a map of HTTP verbs to RouteRecognizers
   *                      corresponding to the provided URL's
   *                      hostname and port
   */
  add(url: string, verbs: HTTPVerb[]) {
    const { host, pathname } = new URL(url);
    const registry = this.registries.get(host);

    if (registry === undefined) {
      this.registries.set(host, createPassthroughRegistry(pathname, verbs));
    } else {
      const verbsToSet =
        Array.isArray(verbs) && verbs.length
          ? verbs.map((v) => v.toUpperCase())
          : allVerbs;
      verbsToSet.forEach((v) => {
        const existingRecognizer = registry.get(v);
        if (existingRecognizer) {
          existingRecognizer.add([{ path: pathname, handler: noOpHandler }]);
        } else {
          const recognizer = new RouteRecognizer();
          recognizer.add([{ path: pathname, handler: noOpHandler }]);
          registry.set(v, recognizer);
        }
      });
    }
  }

  retrieve(url: string) {
    return this.registries.get(url);
  }
}
