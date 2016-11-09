(function () {
/**
 * @license almond 0.3.1 Copyright (c) 2011-2014, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/almond for details
 */
//Going sloppy to avoid 'use strict' string cost, but strict practices should
//be followed.
/*jslint sloppy: true */
/*global setTimeout: false */

var requirejs, require, define;
(function (undef) {
    var main, req, makeMap, handlers,
        defined = {},
        waiting = {},
        config = {},
        defining = {},
        hasOwn = Object.prototype.hasOwnProperty,
        aps = [].slice,
        jsSuffixRegExp = /\.js$/;

    function hasProp(obj, prop) {
        return hasOwn.call(obj, prop);
    }

    /**
     * Given a relative module name, like ./something, normalize it to
     * a real name that can be mapped to a path.
     * @param {String} name the relative name
     * @param {String} baseName a real name that the name arg is relative
     * to.
     * @returns {String} normalized name
     */
    function normalize(name, baseName) {
        var nameParts, nameSegment, mapValue, foundMap, lastIndex,
            foundI, foundStarMap, starI, i, j, part,
            baseParts = baseName && baseName.split("/"),
            map = config.map,
            starMap = (map && map['*']) || {};

        //Adjust any relative paths.
        if (name && name.charAt(0) === ".") {
            //If have a base name, try to normalize against it,
            //otherwise, assume it is a top-level require that will
            //be relative to baseUrl in the end.
            if (baseName) {
                name = name.split('/');
                lastIndex = name.length - 1;

                // Node .js allowance:
                if (config.nodeIdCompat && jsSuffixRegExp.test(name[lastIndex])) {
                    name[lastIndex] = name[lastIndex].replace(jsSuffixRegExp, '');
                }

                //Lop off the last part of baseParts, so that . matches the
                //"directory" and not name of the baseName's module. For instance,
                //baseName of "one/two/three", maps to "one/two/three.js", but we
                //want the directory, "one/two" for this normalization.
                name = baseParts.slice(0, baseParts.length - 1).concat(name);

                //start trimDots
                for (i = 0; i < name.length; i += 1) {
                    part = name[i];
                    if (part === ".") {
                        name.splice(i, 1);
                        i -= 1;
                    } else if (part === "..") {
                        if (i === 1 && (name[2] === '..' || name[0] === '..')) {
                            //End of the line. Keep at least one non-dot
                            //path segment at the front so it can be mapped
                            //correctly to disk. Otherwise, there is likely
                            //no path mapping for a path starting with '..'.
                            //This can still fail, but catches the most reasonable
                            //uses of ..
                            break;
                        } else if (i > 0) {
                            name.splice(i - 1, 2);
                            i -= 2;
                        }
                    }
                }
                //end trimDots

                name = name.join("/");
            } else if (name.indexOf('./') === 0) {
                // No baseName, so this is ID is resolved relative
                // to baseUrl, pull off the leading dot.
                name = name.substring(2);
            }
        }

        //Apply map config if available.
        if ((baseParts || starMap) && map) {
            nameParts = name.split('/');

            for (i = nameParts.length; i > 0; i -= 1) {
                nameSegment = nameParts.slice(0, i).join("/");

                if (baseParts) {
                    //Find the longest baseName segment match in the config.
                    //So, do joins on the biggest to smallest lengths of baseParts.
                    for (j = baseParts.length; j > 0; j -= 1) {
                        mapValue = map[baseParts.slice(0, j).join('/')];

                        //baseName segment has  config, find if it has one for
                        //this name.
                        if (mapValue) {
                            mapValue = mapValue[nameSegment];
                            if (mapValue) {
                                //Match, update name to the new value.
                                foundMap = mapValue;
                                foundI = i;
                                break;
                            }
                        }
                    }
                }

                if (foundMap) {
                    break;
                }

                //Check for a star map match, but just hold on to it,
                //if there is a shorter segment match later in a matching
                //config, then favor over this star map.
                if (!foundStarMap && starMap && starMap[nameSegment]) {
                    foundStarMap = starMap[nameSegment];
                    starI = i;
                }
            }

            if (!foundMap && foundStarMap) {
                foundMap = foundStarMap;
                foundI = starI;
            }

            if (foundMap) {
                nameParts.splice(0, foundI, foundMap);
                name = nameParts.join('/');
            }
        }

        return name;
    }

    function makeRequire(relName, forceSync) {
        return function () {
            //A version of a require function that passes a moduleName
            //value for items that may need to
            //look up paths relative to the moduleName
            var args = aps.call(arguments, 0);

            //If first arg is not require('string'), and there is only
            //one arg, it is the array form without a callback. Insert
            //a null so that the following concat is correct.
            if (typeof args[0] !== 'string' && args.length === 1) {
                args.push(null);
            }
            return req.apply(undef, args.concat([relName, forceSync]));
        };
    }

    function makeNormalize(relName) {
        return function (name) {
            return normalize(name, relName);
        };
    }

    function makeLoad(depName) {
        return function (value) {
            defined[depName] = value;
        };
    }

    function callDep(name) {
        if (hasProp(waiting, name)) {
            var args = waiting[name];
            delete waiting[name];
            defining[name] = true;
            main.apply(undef, args);
        }

        if (!hasProp(defined, name) && !hasProp(defining, name)) {
            throw new Error('No ' + name);
        }
        return defined[name];
    }

    //Turns a plugin!resource to [plugin, resource]
    //with the plugin being undefined if the name
    //did not have a plugin prefix.
    function splitPrefix(name) {
        var prefix,
            index = name ? name.indexOf('!') : -1;
        if (index > -1) {
            prefix = name.substring(0, index);
            name = name.substring(index + 1, name.length);
        }
        return [prefix, name];
    }

    /**
     * Makes a name map, normalizing the name, and using a plugin
     * for normalization if necessary. Grabs a ref to plugin
     * too, as an optimization.
     */
    makeMap = function (name, relName) {
        var plugin,
            parts = splitPrefix(name),
            prefix = parts[0];

        name = parts[1];

        if (prefix) {
            prefix = normalize(prefix, relName);
            plugin = callDep(prefix);
        }

        //Normalize according
        if (prefix) {
            if (plugin && plugin.normalize) {
                name = plugin.normalize(name, makeNormalize(relName));
            } else {
                name = normalize(name, relName);
            }
        } else {
            name = normalize(name, relName);
            parts = splitPrefix(name);
            prefix = parts[0];
            name = parts[1];
            if (prefix) {
                plugin = callDep(prefix);
            }
        }

        //Using ridiculous property names for space reasons
        return {
            f: prefix ? prefix + '!' + name : name, //fullName
            n: name,
            pr: prefix,
            p: plugin
        };
    };

    function makeConfig(name) {
        return function () {
            return (config && config.config && config.config[name]) || {};
        };
    }

    handlers = {
        require: function (name) {
            return makeRequire(name);
        },
        exports: function (name) {
            var e = defined[name];
            if (typeof e !== 'undefined') {
                return e;
            } else {
                return (defined[name] = {});
            }
        },
        module: function (name) {
            return {
                id: name,
                uri: '',
                exports: defined[name],
                config: makeConfig(name)
            };
        }
    };

    main = function (name, deps, callback, relName) {
        var cjsModule, depName, ret, map, i,
            args = [],
            callbackType = typeof callback,
            usingExports;

        //Use name if no relName
        relName = relName || name;

        //Call the callback to define the module, if necessary.
        if (callbackType === 'undefined' || callbackType === 'function') {
            //Pull out the defined dependencies and pass the ordered
            //values to the callback.
            //Default to [require, exports, module] if no deps
            deps = !deps.length && callback.length ? ['require', 'exports', 'module'] : deps;
            for (i = 0; i < deps.length; i += 1) {
                map = makeMap(deps[i], relName);
                depName = map.f;

                //Fast path CommonJS standard dependencies.
                if (depName === "require") {
                    args[i] = handlers.require(name);
                } else if (depName === "exports") {
                    //CommonJS module spec 1.1
                    args[i] = handlers.exports(name);
                    usingExports = true;
                } else if (depName === "module") {
                    //CommonJS module spec 1.1
                    cjsModule = args[i] = handlers.module(name);
                } else if (hasProp(defined, depName) ||
                           hasProp(waiting, depName) ||
                           hasProp(defining, depName)) {
                    args[i] = callDep(depName);
                } else if (map.p) {
                    map.p.load(map.n, makeRequire(relName, true), makeLoad(depName), {});
                    args[i] = defined[depName];
                } else {
                    throw new Error(name + ' missing ' + depName);
                }
            }

            ret = callback ? callback.apply(defined[name], args) : undefined;

            if (name) {
                //If setting exports via "module" is in play,
                //favor that over return value and exports. After that,
                //favor a non-undefined return value over exports use.
                if (cjsModule && cjsModule.exports !== undef &&
                        cjsModule.exports !== defined[name]) {
                    defined[name] = cjsModule.exports;
                } else if (ret !== undef || !usingExports) {
                    //Use the return value from the function.
                    defined[name] = ret;
                }
            }
        } else if (name) {
            //May just be an object definition for the module. Only
            //worry about defining if have a module name.
            defined[name] = callback;
        }
    };

    requirejs = require = req = function (deps, callback, relName, forceSync, alt) {
        if (typeof deps === "string") {
            if (handlers[deps]) {
                //callback in this case is really relName
                return handlers[deps](callback);
            }
            //Just return the module wanted. In this scenario, the
            //deps arg is the module name, and second arg (if passed)
            //is just the relName.
            //Normalize module name, if it contains . or ..
            return callDep(makeMap(deps, callback).f);
        } else if (!deps.splice) {
            //deps is a config object, not an array.
            config = deps;
            if (config.deps) {
                req(config.deps, config.callback);
            }
            if (!callback) {
                return;
            }

            if (callback.splice) {
                //callback is an array, which means it is a dependency list.
                //Adjust args if there are dependencies
                deps = callback;
                callback = relName;
                relName = null;
            } else {
                deps = undef;
            }
        }

        //Support require(['a'])
        callback = callback || function () {};

        //If relName is a function, it is an errback handler,
        //so remove it.
        if (typeof relName === 'function') {
            relName = forceSync;
            forceSync = alt;
        }

        //Simulate async callback;
        if (forceSync) {
            main(undef, deps, callback, relName);
        } else {
            //Using a non-zero value because of concern for what old browsers
            //do, and latest browsers "upgrade" to 4 if lower value is used:
            //http://www.whatwg.org/specs/web-apps/current-work/multipage/timers.html#dom-windowtimers-settimeout:
            //If want a value immediately, use require('id') instead -- something
            //that works in almond on the global level, but not guaranteed and
            //unlikely to work in other AMD implementations.
            setTimeout(function () {
                main(undef, deps, callback, relName);
            }, 4);
        }

        return req;
    };

    /**
     * Just drops the config on the floor, but returns req in case
     * the config return value is used.
     */
    req.config = function (cfg) {
        return req(cfg);
    };

    /**
     * Expose module registry for debugging and tooling
     */
    requirejs._defined = defined;

    define = function (name, deps, callback) {
        if (typeof name !== 'string') {
            throw new Error('See almond README: incorrect module build, no module name');
        }

        //This module may not have dependencies
        if (!deps.splice) {
            //deps is not an array, so probably means
            //an object literal or factory function for
            //the value. Adjust args.
            callback = deps;
            deps = [];
        }

        if (!hasProp(defined, name) && !hasProp(waiting, name)) {
            waiting[name] = [name, deps, callback];
        }
    };

    define.amd = {
        jQuery: true
    };
}());

define("components/almond/almond", function(){});

define('app/lib/ready',[],function() {

    "use strict";

    var loaded = false;
    var once = function(callback) {
        if (! loaded) {
            loaded = true;
            callback();
        }
    };

    var domready = function(callback) {

        // HTML5 standard to listen for dom readiness
        document.addEventListener('DOMContentLoaded', function() {
            once(callback);
        });

        // if dom is already ready, just run callback
        if (document.readyState === "interactive" || document.readyState === "complete" ) {
            once(callback);
        }
    };

    return domready;

});
define('app/lib/promise',[],function() {

    "use strict";

    var stderr = function(text) { console.log(text); };

    var Promise = function() {
        this.success = [];
        this.errors = [];
    };

    Promise.prototype.then = function(onSuccess, onError) {
        this.success.push(onSuccess);
        if (onError) {
            this.errors.push(onError);
        } else {
            this.errors.push(stderr);
        }
    };

    var Defer = function() {
        this.promise = new Promise();
    };

    Defer.prototype = {
        promise: Promise,
        resolve: function(rv) {
            this.promise.success.forEach(function(callback) {
                window.setTimeout(function() {
                    callback(rv);
                }, 0);
            });
        },

        reject: function(error) {
            this.promise.errors.forEach(function(callback) {
                window.setTimeout(function() {
                    callback(error);
                }, 0);
            });
        }
    };

    var when = function(obj, func) {
        if (obj instanceof Promise) {
            return obj.then(func);
        } else {
            return func(obj);
        }
    };

    return {
        defer: function() { return new Defer(); },
        when: when
    };

});

define('app/globals',[],function() {
    "use strict";

    var Offset = function() {
        this.values = [];
    };

    Offset.prototype.update = function(remoteTime) {
        this.values.push((new Date()).getTime() - remoteTime.getTime());
    };

    Offset.prototype.localTime = function() {
        return new Date((new Date()).getTime() - this.values.reduce(
            function(a, b) { return a + b; }) / this.values.length);
    };

    return {
        offset: new Offset()
    };

});

define('app/api',["app/lib/promise", "app/globals"], function(Q, globals) {

    "use strict";

    var salt = "Eech7co8Ohloopo9Ol6baimi",
        location = window.location.pathname;

    var script, endpoint,
        js = document.getElementsByTagName("script");

    // prefer `data-isso="//host/api/endpoint"` if provided
    for (var i = 0; i < js.length; i++) {
        if (js[i].hasAttribute("data-isso")) {
            endpoint = js[i].getAttribute("data-isso");
            break;
        }
    }

    // if no async-script is embedded, use the last script tag of `js`
    if (! endpoint) {
        for (i = 0; i < js.length; i++) {
            if (js[i].getAttribute("async") || js[i].getAttribute("defer")) {
                throw "Isso's automatic configuration detection failed, please " +
                      "refer to https://github.com/posativ/isso#client-configuration " +
                      "and add a custom `data-isso` attribute.";
            }
        }

        script = js[js.length - 1];
        endpoint = script.src.substring(0, script.src.length - "/js/embed.min.js".length);
    }

    //  strip trailing slash
    if (endpoint[endpoint.length - 1] === "/") {
        endpoint = endpoint.substring(0, endpoint.length - 1);
    }

    var curl = function(method, url, data, resolve, reject) {

        var xhr = new XMLHttpRequest();

        function onload() {

            var date = xhr.getResponseHeader("Date");
            if (date !== null) {
                globals.offset.update(new Date(date));
            }

            var cookie = xhr.getResponseHeader("X-Set-Cookie");
            if (cookie && cookie.match(/^isso-/)) {
                document.cookie = cookie;
            }

            if (xhr.status >= 500) {
                if (reject) {
                    reject(xhr.body);
                }
            } else {
                resolve({status: xhr.status, body: xhr.responseText});
            }
        }

        try {
            xhr.open(method, url, true);
            xhr.withCredentials = true;
            xhr.setRequestHeader("Content-Type", "application/json");

            xhr.onreadystatechange = function () {
                if (xhr.readyState === 4) {
                    onload();
                }
            };
        } catch (exception) {
            (reject || console.log)(exception.message);
        }

        xhr.send(data);
    };

    var qs = function(params) {
        var rv = "";
        for (var key in params) {
            if (params.hasOwnProperty(key) &&
                params[key] !== null && typeof(params[key]) !== "undefined") {
                rv += key + "=" + encodeURIComponent(params[key]) + "&";
            }
        }

        return rv.substring(0, rv.length - 1);  // chop off trailing "&"
    };

    var create = function(tid, data) {
        var deferred = Q.defer();
        curl("POST", endpoint + "/new?" + qs({uri: tid || location}), JSON.stringify(data),
            function (rv) {
                if (rv.status === 201 || rv.status === 202) {
                    deferred.resolve(JSON.parse(rv.body));
                } else {
                    deferred.reject(rv.body);
                }
            });
        return deferred.promise;
    };

    var modify = function(id, data) {
        var deferred = Q.defer();
        curl("PUT", endpoint + "/id/" + id, JSON.stringify(data), function (rv) {
            if (rv.status === 403) {
                deferred.reject("Not authorized to modify this comment!");
            } else if (rv.status === 200) {
                deferred.resolve(JSON.parse(rv.body));
            } else {
                deferred.reject(rv.body);
            }
        });
        return deferred.promise;
    };

    var remove = function(id) {
        var deferred = Q.defer();
        curl("DELETE", endpoint + "/id/" + id, null, function(rv) {
            if (rv.status === 403) {
                deferred.reject("Not authorized to remove this comment!");
            } else if (rv.status === 200) {
                deferred.resolve(JSON.parse(rv.body) === null);
            } else {
                deferred.reject(rv.body);
            }
        });
        return deferred.promise;
    };

    var view = function(id, plain) {
        var deferred = Q.defer();
        curl("GET", endpoint + "/id/" + id + "?" + qs({plain: plain}), null,
            function(rv) { deferred.resolve(JSON.parse(rv.body)); });
        return deferred.promise;
    };

    var fetch = function(tid, limit, nested_limit, parent, lastcreated) {
        if (typeof(limit) === 'undefined') { limit = "inf"; }
        if (typeof(nested_limit) === 'undefined') { nested_limit = "inf"; }
        if (typeof(parent) === 'undefined') { parent = null; }

        var query_dict = {uri: tid || location, after: lastcreated, parent: parent};

        if(limit !== "inf") {
            query_dict['limit'] = limit;
        }
        if(nested_limit !== "inf"){
            query_dict['nested_limit'] = nested_limit;
        }

        var deferred = Q.defer();
        curl("GET", endpoint + "/?" +
            qs(query_dict), null, function(rv) {
                if (rv.status === 200) {
                    deferred.resolve(JSON.parse(rv.body));
                } else if (rv.status === 404) {
                    deferred.resolve({total_replies: 0});
                } else {
                    deferred.reject(rv.body);
                }
            });
        return deferred.promise;
    };

    var count = function(urls) {
        var deferred = Q.defer();
        curl("POST", endpoint + "/count", JSON.stringify(urls), function(rv) {
            if (rv.status === 200) {
                deferred.resolve(JSON.parse(rv.body));
            } else {
                deferred.reject(rv.body);
            }
        });
        return deferred.promise;
    };

    var like = function(id) {
        var deferred = Q.defer();
        curl("POST", endpoint + "/id/" + id + "/like", null,
            function(rv) { deferred.resolve(JSON.parse(rv.body)); });
        return deferred.promise;
    };

    var dislike = function(id) {
        var deferred = Q.defer();
        curl("POST", endpoint + "/id/" + id + "/dislike", null,
            function(rv) { deferred.resolve(JSON.parse(rv.body)); });
        return deferred.promise;
    };

    return {
        endpoint: endpoint,
        salt: salt,

        create: create,
        modify: modify,
        remove: remove,
        view: view,
        fetch: fetch,
        count: count,
        like: like,
        dislike: dislike
    };
});

define('app/dom',[],function() {

    "use strict";

    function Element(node) {
        this.obj = node;

        this.replace = function (el) {
            var element = DOM.htmlify(el);
            node.parentNode.replaceChild(element.obj, node);
            return element;
        };

        this.prepend = function (el) {
            var element = DOM.htmlify(el);
            node.insertBefore(element.obj, node.firstChild);
            return element;
        };

        this.append = function (el) {
            var element = DOM.htmlify(el);
            node.appendChild(element.obj);
            return element;
        };

        this.insertAfter = function(el) {
            var element = DOM.htmlify(el);
            node.parentNode.insertBefore(element.obj, node.nextSibling);
            return element;
        };

        /**
         * Shortcut for `Element.addEventListener`, prevents default event
         * by default, set :param prevents: to `false` to change that behavior.
         */
        this.on = function(type, listener, prevent) {
            node.addEventListener(type, function(event) {
                listener(event);
                if (prevent === undefined || prevent) {
                    event.preventDefault();
                }
            });
        };

        /**
         * Toggle between two internal states on event :param type: e.g. to
         * cycle form visibility. Callback :param a: is called on first event,
         * :param b: next time.
         *
         * You can skip to the next state without executing the callback with
         * `toggler.next()`. You can prevent a cycle when you call `toggler.wait()`
         * during an event.
         */
        this.toggle = function(type, a, b) {

            var toggler = new Toggle(a, b);
            this.on(type, function() {
                toggler.next();
            });
        };

        this.detach = function() {
            // Detach an element from the DOM and return it.
            node.parentNode.removeChild(this.obj);
            return this;
        };

        this.remove = function() {
            // IE quirks
            node.parentNode.removeChild(this.obj);
        };

        this.show = function() {
            node.style.display = "block";
        };

        this.hide = function() {
            node.style.display = "none";
        };

        this.setText = function(text) {
            node.textContent = text;
        };

        this.setHtml = function(html) {
            node.innerHTML = html;
        };

        this.blur = function() { node.blur() };
        this.focus = function() { node.focus() };
        this.scrollIntoView = function(args) { node.scrollIntoView(args) };

        this.setAttribute = function(key, value) { node.setAttribute(key, value) };
        this.getAttribute = function(key) { return node.getAttribute(key) };

        this.classList = node.classList;

        Object.defineProperties(this, {
            "textContent": {
                get: function() { return node.textContent; },
                set: function(textContent) { node.textContent = textContent; }
            },
            "innerHTML": {
                get: function() { return node.innerHTML; },
                set: function(innerHTML) { node.innerHTML = innerHTML; }
            },
            "value": {
                get: function() { return node.value; },
                set: function(value) { node.value = value; }
            },
            "placeholder": {
                get: function() { return node.placeholder; },
                set: function(placeholder) { node.placeholder = placeholder; }
            }
        });
    }

    var Toggle = function(a, b) {
        this.state = false;

        this.next = function() {
            if (! this.state) {
                this.state = true;
                a(this);
            } else {
                this.state = false;
                b(this);
            }
        };

        this.wait = function() {
            this.state = ! this.state;
        };
    };

    var DOM = function(query, root, single) {
        /*
        jQuery-like CSS selector which returns on :param query: either a
        single node (unless single=false), a node list or null.

        :param root: only queries within the given element.
         */

        if (typeof single === "undefined") {
            single = true;
        }

        if (! root) {
            root = window.document;
        }

        if (root instanceof Element) {
            root = root.obj;
        }
        var elements = [].slice.call(root.querySelectorAll(query), 0);

        if (elements.length === 0) {
            return null;
        }

        if (elements.length === 1 && single) {
            return new Element(elements[0]);
        }

        // convert NodeList to Array
        elements = [].slice.call(elements, 0);

        return elements.map(function(el) {
            return new Element(el);
        });
    };

    DOM.htmlify = function(el) {
        /*
        Convert :param html: into an Element (if not already).
        */

        if (el instanceof Element) {
            return el;
        }

        if (el instanceof window.Element) {
            return new Element(el);
        }

        var wrapper = DOM.new("div");
        wrapper.innerHTML = el;
        return new Element(wrapper.firstChild);
    };

    DOM.new = function(tag, content) {
        /*
        A helper to build HTML with pure JS. You can pass class names and
        default content as well:

            var par = DOM.new("p"),
                div = DOM.new("p.some.classes"),
                div = DOM.new("textarea.foo", "...")
         */

        var el = document.createElement(tag.split(".")[0]);
        tag.split(".").slice(1).forEach(function(val) { el.classList.add(val); });

        if (["A", "LINK"].indexOf(el.nodeName) > -1) {
            el.href = "#";
        }

        if (!content && content !== 0) {
            content = "";
        }
        if (["TEXTAREA", "INPUT"].indexOf(el.nodeName) > -1) {
            el.value = content;
        } else {
            el.textContent = content;
        }
        return el;
    };

    DOM.each = function(tag, func) {
        // XXX really needed? Maybe better as NodeList method
        Array.prototype.forEach.call(document.getElementsByTagName(tag), func);
    };

    return DOM;
});

define('app/config',[],function() {
    "use strict";

    var config = {
        "css": true,
        "lang": (navigator.language || navigator.userLanguage).split("-")[0],
        "reply-to-self": false,
        "require-email": false,
        "require-author": false,
        "max-comments-top": "inf",
        "max-comments-nested": 5,
        "reveal-on-click": 5,
        "avatar": true,
        "avatar-bg": "#f0f0f0",
        "avatar-fg": ["#9abf88", "#5698c4", "#e279a3", "#9163b6",
                      "#be5168", "#f19670", "#e4bf80", "#447c69"].join(" "),
        "vote": true,
        "vote-levels": null
    };

    var js = document.getElementsByTagName("script");

    for (var i = 0; i < js.length; i++) {
        for (var j = 0; j < js[i].attributes.length; j++) {
            var attr = js[i].attributes[j];
            if (/^data-isso-/.test(attr.name)) {
                try {
                    config[attr.name.substring(10)] = JSON.parse(attr.value);
                } catch (ex) {
                    config[attr.name.substring(10)] = attr.value;
                }
            }
        }
    }

    // split avatar-fg on whitespace
    config["avatar-fg"] = config["avatar-fg"].split(" ");

    return config;

});

define('app/i18n/bg',{
    "postbox-text": "Въведете коментара си тук (поне 3 знака)",
    "postbox-author": "Име/псевдоним (незадължително)",
    "postbox-email": "Ел. поща (незадължително)",
    "postbox-website": "Уебсайт (незадължително)",
    "postbox-submit": "Публикуване",
    "num-comments": "1 коментар\n{{ n }} коментара",
    "no-comments": "Все още няма коментари",
    "comment-reply": "Отговор",
    "comment-edit": "Редактиране",
    "comment-save": "Запис",
    "comment-delete": "Изтриване",
    "comment-confirm": "Потвърждение",
    "comment-close": "Затваряне",
    "comment-cancel": "Отказ",
    "comment-deleted": "Коментарът е изтрит.",
    "comment-queued": "Коментарът чака на опашката за модериране.",
    "comment-anonymous": "анонимен",
    "comment-hidden": "{{ n }} скрити",
    "date-now": "сега",
    "date-minute": "преди 1 минута\nпреди {{ n }} минути",
    "date-hour": "преди 1 час\nпреди {{ n }} часа",
    "date-day": "вчера\nпреди {{ n }} дни",
    "date-week": "миналата седмица\nпреди {{ n }} седмици",
    "date-month": "миналия месец\nпреди {{ n }} месеца",
    "date-year": "миналата година\nпреди {{ n }} години"
});

define('app/i18n/cs',{
    "postbox-text": "Sem napiště svůj komentář (nejméně 3 znaky)",
    "postbox-author": "Jméno (nepovinné)",
    "postbox-email": "E-mail (nepovinný)",
    "postbox-website": "Web (nepovinný)",
    "postbox-submit": "Publikovat",
    "num-comments": "Jeden komentář\n{{ n }} Komentářů",
    "no-comments": "Zatím bez komentářů",
    "comment-reply": "Odpovědět",
    "comment-edit": "Upravit",
    "comment-save": "Uložit",
    "comment-delete": "Smazat",
    "comment-confirm": "Potvrdit",
    "comment-close": "Zavřít",
    "comment-cancel": "Zrušit",
    "comment-deleted": "Komentář smazán",
    "comment-queued": "Komentář ve frontě na schválení",
    "comment-anonymous": "Anonym",
    "comment-hidden": "{{ n }} skryto",
    "date-now": "právě teď",
    "date-minute": "před minutou\npřed {{ n }} minutami",
    "date-hour": "před hodinou\npřed {{ n }} hodinami",
    "date-day": "včera\npřed {{ n }} dny",
    "date-week": "minulý týden\npřed {{ n }} týdny",
    "date-month": "minulý měsíc\npřed {{ n }} měsíci",
    "date-year": "minulý rok\npřed {{ n }} lety"
});

define('app/i18n/de',{
    "postbox-text": "Kommentar hier eintippen (mindestens 3 Zeichen)",
    "postbox-author": "Name (optional)",
    "postbox-email": "Email (optional)",
    "postbox-website": "Website (optional)",
    "postbox-submit": "Abschicken",
    "num-comments": "1 Kommentar\n{{ n }} Kommentare",
    "no-comments": "Keine Kommentare bis jetzt",
    "comment-reply": "Antworten",
    "comment-edit": "Bearbeiten",
    "comment-save": "Speichern",
    "comment-delete": "Löschen",
    "comment-confirm": "Bestätigen",
    "comment-close": "Schließen",
    "comment-cancel": "Abbrechen",
    "comment-deleted": "Kommentar gelöscht.",
    "comment-queued": "Kommentar muss noch freigeschaltet werden.",
    "comment-anonymous": "Anonym",
    "comment-hidden": "{{ n }} versteckt",
    "date-now": "eben jetzt",
    "date-minute": "vor einer Minute\nvor {{ n }} Minuten",
    "date-hour": "vor einer Stunde\nvor {{ n }} Stunden",
    "date-day": "Gestern\nvor {{ n }} Tagen",
    "date-week": "letzte Woche\nvor {{ n }} Wochen",
    "date-month": "letzten Monat\nvor {{ n }} Monaten",
    "date-year": "letztes Jahr\nvor {{ n }} Jahren"
});

define('app/i18n/en',{
    "postbox-text": "Type Comment Here (at least 3 chars)",
    "postbox-author": "Name (optional)",
    "postbox-email": "E-mail (optional)",
    "postbox-website": "Website (optional)",
    "postbox-submit": "Submit",

    "num-comments": "One Comment\n{{ n }} Comments",
    "no-comments": "No Comments Yet",

    "comment-reply": "Reply",
    "comment-edit": "Edit",
    "comment-save": "Save",
    "comment-delete": "Delete",
    "comment-confirm": "Confirm",
    "comment-close": "Close",
    "comment-cancel": "Cancel",
    "comment-deleted": "Comment deleted.",
    "comment-queued": "Comment in queue for moderation.",
    "comment-anonymous": "Anonymous",
    "comment-hidden": "{{ n }} Hidden",

    "date-now": "right now",
    "date-minute": "a minute ago\n{{ n }} minutes ago",
    "date-hour": "an hour ago\n{{ n }} hours ago",
    "date-day": "Yesterday\n{{ n }} days ago",
    "date-week": "last week\n{{ n }} weeks ago",
    "date-month": "last month\n{{ n }} months ago",
    "date-year": "last year\n{{ n }} years ago"
});

define('app/i18n/fi',{
    "postbox-text": "Kirjoita kommentti tähän (vähintään 3 merkkiä)",
    "postbox-author": "Nimi (valinnainen)",
    "postbox-email": "Sähköposti (valinnainen)",
    "postbox-website": "Web-sivu (valinnainen)",
    "postbox-submit": "Lähetä",

    "num-comments": "Yksi kommentti\n{{ n }} kommenttia",
    "no-comments": "Ei vielä kommentteja",

    "comment-reply": "Vastaa",
    "comment-edit": "Muokkaa",
    "comment-save": "Tallenna",
    "comment-delete": "Poista",
    "comment-confirm": "Vahvista",
    "comment-close": "Sulje",
    "comment-cancel": "Peru",
    "comment-deleted": "Kommentti on poistettu.",
    "comment-queued": "Kommentti on laitettu jonoon odottamaan moderointia.",
    "comment-anonymous": "Nimetön",
    "comment-hidden": "{{ n }} piilotettua",

    "date-now": "hetki sitten",
    "date-minute": "minuutti sitten\n{{ n }} minuuttia sitten",
    "date-hour": "tunti sitten\n{{ n }} tuntia sitten",
    "date-day": "eilen\n{{ n }} päivää sitten",
    "date-week": "viime viikolla\n{{ n }} viikkoa sitten",
    "date-month": "viime kuussa\n{{ n }} kuukautta sitten",
    "date-year": "viime vuonna\n{{ n }} vuotta sitten"
});

define('app/i18n/fr',{
    "postbox-text": "Insérez votre commentaire ici (au moins 3 lettres)",
    "postbox-author": "Nom (optionnel)",
    "postbox-email": "Courriel (optionnel)",
    "postbox-website": "Site web (optionnel)",
    "postbox-submit": "Soumettre",
    "num-comments": "{{ n }} commentaire\n{{ n }} commentaires",
    "no-comments": "Aucun commentaire pour l'instant",
    "comment-reply": "Répondre",
    "comment-edit": "Éditer",
    "comment-save": "Enregistrer",
    "comment-delete": "Supprimer",
    "comment-confirm": "Confirmer",
    "comment-close": "Fermer",
    "comment-cancel": "Annuler",
    "comment-deleted": "Commentaire supprimé.",
    "comment-queued": "Commentaire en attente de modération.",
    "comment-anonymous": "Anonyme",
    "comment-hidden": "1 caché\n{{ n }} cachés",
    "date-now": "À l'instant",
    "date-minute": "Il y a une minute\nIl y a {{ n }} minutes",
    "date-hour": "Il y a une heure\nIl y a {{ n }} heures ",
    "date-day": "Hier\nIl y a {{ n }} jours",
    "date-week": "Il y a une semaine\nIl y a {{ n }} semaines",
    "date-month": "Il y a un mois\nIl y a {{ n }} mois",
    "date-year": "Il y a un an\nIl y a {{ n }} ans"
});

define('app/i18n/hr',{
    "postbox-text": "Napiši komentar ovdje (najmanje 3 znaka)",
    "postbox-author": "Ime (neobavezno)",
    "postbox-email": "E-mail (neobavezno)",
    "postbox-website": "Web stranica (neobavezno)",
    "postbox-submit": "Pošalji",
    "num-comments": "Jedan komentar\n{{ n }} komentara",
    "no-comments": "Još nema komentara",
    "comment-reply": "Odgovori",
    "comment-edit": "Uredi",
    "comment-save": "Spremi",
    "comment-delete": "Obriši",
    "comment-confirm": "Potvrdi",
    "comment-close": "Zatvori",
    "comment-cancel": "Odustani",
    "comment-deleted": "Komentar obrisan",
    "comment-queued": "Komentar u redu za provjeru.",
    "comment-anonymous": "Anonimno",
    "comment-hidden": "{{ n }} Skrivenih",
    "date-now": "upravo",
    "date-minute": "prije minutu\nprije {{ n }} minuta",
    "date-hour": "prije sat vremena\nprije {{ n }} sati",
    "date-day": "jučer\nprije {{ n }} dana",
    "date-week": "prošli tjedan\nprije {{ n }} tjedana",
    "date-month": "prošli mjesec\nprije {{ n }} mjeseci",
    "date-year": "prošle godine\nprije {{ n }} godina"
});

define('app/i18n/ru',{
    "postbox-text": "Оставить комментарий (минимум 3 символа)",
    "postbox-author": "Имя (необязательно)",
    "postbox-email": "Email (необязательно)",
    "postbox-website": "Сайт (необязательно)",
    "postbox-submit": "Отправить",
    "num-comments": "{{ n }} комментарий\n{{ n }} комментария\n{{ n }} комментариев",
    "no-comments": "Пока нет комментариев",
    "comment-reply": "Ответить",
    "comment-edit": "Правка",
    "comment-save": "Сохранить",
    "comment-delete": "Удалить",
    "comment-confirm": "Подтвердить удаление",
    "comment-close": "Закрыть",
    "comment-cancel": "Отменить",
    "comment-deleted": "Комментарий удалён",
    "comment-queued": "Комментарий будет проверен модератором",
    "comment-anonymous": "Аноним",
    "comment-hidden": "Скрыт {{ n }} комментарий\nСкрыто {{ n }} комментария\nСкрыто {{ n }} комментариев",
    "date-now": "Только что",
    "date-minute": "{{ n }} минуту назад\n{{ n }} минуты назад\n{{ n }} минут назад",
    "date-hour": "{{ n }} час назад\n{{ n }} часа назад\n{{ n }} часов назад",
    "date-day": "{{ n }} день назад\n{{ n }} дня назад\n{{ n }} дней назад",
    "date-week": "{{ n }} неделю назад\n{{ n }} недели назад\n{{ n }} недель назад",
    "date-month": "{{ n }} месяц назад\n{{ n }} месяца назад\n{{ n }} месяцев назад",
    "date-year": "{{ n }} год назад\n{{ n }} года назад\n{{ n }} лет назад"
});

define('app/i18n/it',{
    "postbox-text": "Scrivi un commento qui (minimo 3 caratteri)",
    "postbox-author": "Nome (opzionale)",
    "postbox-email": "E-mail (opzionale)",
    "postbox-website": "Sito web (opzionale)",
    "postbox-submit": "Invia",
    "num-comments": "Un Commento\n{{ n }} Commenti",
    "no-comments": "Ancora Nessun Commento",
    "comment-reply": "Rispondi",
    "comment-edit": "Modifica",
    "comment-save": "Salva",
    "comment-delete": "Elimina",
    "comment-confirm": "Conferma",
    "comment-close": "Chiudi",
    "comment-cancel": "Cancella",
    "comment-deleted": "Commento eliminato.",
    "comment-queued": "Commento in coda per moderazione.",
    "comment-anonymous": "Anonimo",
    "comment-hidden": "{{ n }} Nascosto",
    "date-now": "poco fa",
    "date-minute": "un minuto fa\n{{ n }} minuti fa",
    "date-hour": "un ora fa\n{{ n }} ore fa",
    "date-day": "Ieri\n{{ n }} giorni fa",
    "date-week": "questa settimana\n{{ n }} settimane fa",
    "date-month": "questo mese\n{{ n }} mesi fa",
    "date-year": "quest'anno\n{{ n }} anni fa"
});

define('app/i18n/eo',{
    "postbox-text": "Tajpu komenton ĉi-tie (almenaŭ 3 signoj)",
    "postbox-author": "Nomo (malnepra)",
    "postbox-email": "Retadreso (malnepra)",
    "postbox-website": "Retejo (malnepra)",
    "postbox-submit": "Sendu",
    "num-comments": "{{ n }} komento\n{{ n }} komentoj",
    "no-comments": "Neniu komento ankoraŭ",
    "comment-reply": "Respondu",
    "comment-edit": "Redaktu",
    "comment-save": "Savu",
    "comment-delete": "Forviŝu",
    "comment-confirm": "Konfirmu",
    "comment-close": "Fermu",
    "comment-cancel": "Malfaru",
    "comment-deleted": "Komento forviŝita",
    "comment-queued": "Komento en atendovico por kontrolo.",
    "comment-anonymous": "Sennoma",
    "comment-hidden": "{{ n }} kaŝitaj",
    "date-now": "ĵus nun",
    "date-minute": "antaŭ unu minuto\nantaŭ {{ n }} minutoj",
    "date-hour": "antaŭ unu horo\nantaŭ {{ n }} horoj",
    "date-day": "hieraŭ\nantaŭ {{ n }} tagoj",
    "date-week": "lasta semajno\nantaŭ {{ n }} semajnoj",
    "date-month": "lasta monato\nantaŭ {{ n }} monatoj",
    "date-year": "lasta jaro\nantaŭ {{ n }} jaroj"
});

define('app/i18n/sv',{
    "postbox-text": "Skriv din kommentar här (minst 3 tecken)",
    "postbox-author": "Namn (frivilligt)",
    "postbox-email": "E-mail (frivilligt)",
    "postbox-website": "Hemsida (frivilligt)",
    "postbox-submit": "Skicka",
    "num-comments": "En kommentar\n{{ n }} kommentarer",
    "no-comments": "Inga kommentarer än",
    "comment-reply": "Svara",
    "comment-edit": "Redigera",
    "comment-save": "Spara",
    "comment-delete": "Radera",
    "comment-confirm": "Bekräfta",
    "comment-close": "Stäng",
    "comment-cancel": "Avbryt",
    "comment-deleted": "Kommentar raderad.",
    "comment-queued": "Kommentaren inväntar granskning.",
    "comment-anonymous": "Anonym",
    "comment-hidden": "{{ n }} Gömd",
    "date-now": "just nu",
    "date-minute": "en minut sedan\n{{ n }} minuter sedan",
    "date-hour": "en timme sedan\n{{ n }} timmar sedan",
    "date-day": "igår\n{{ n }} dagar sedan",
    "date-week": "förra veckan\n{{ n }} veckor sedan",
    "date-month": "förra månaden\n{{ n }} månader sedan",
    "date-year": "förra året\n{{ n }} år sedan"
});

define('app/i18n/nl',{
    "postbox-text": "Typ reactie hier (minstens 3 karakters)",
    "postbox-author": "Naam (optioneel)",
    "postbox-email": "E-mail (optioneel)",
    "postbox-website": "Website (optioneel)",
    "postbox-submit": "Versturen",
    "num-comments": "Één reactie\n{{ n }} reacties",
    "no-comments": "Nog geen reacties",
    "comment-reply": "Beantwoorden",
    "comment-edit": "Bewerken",
    "comment-save": "Opslaan",
    "comment-delete": "Verwijderen",
    "comment-confirm": "Bevestigen",
    "comment-close": "Sluiten",
    "comment-cancel": "Annuleren",
    "comment-deleted": "Reactie verwijderd.",
    "comment-queued": "Reactie staat in de wachtrij voor goedkeuring.",
    "comment-anonymous": "Anoniem",
    "comment-hidden": "{{ n }} verborgen",
    "date-now": "zojuist",
    "date-minute": "een minuut geleden\n{{ n }} minuten geleden",
    "date-hour": "een uur geleden\n{{ n }} uur geleden",
    "date-day": "gisteren\n{{ n }} dagen geleden",
    "date-week": "vorige week\n{{ n }} weken geleden",
    "date-month": "vorige maand\n{{ n }} maanden geleden",
    "date-year": "vorig jaar\n{{ n }} jaar geleden"
});

define('app/i18n/el_GR',{
    "postbox-text": "Γράψτε το σχόλιο εδώ (τουλάχιστον 3 χαρακτήρες)",
    "postbox-author": "Όνομα (προαιρετικό)",
    "postbox-email": "E-mail (προαιρετικό)",
    "postbox-website": "Ιστοσελίδα (προαιρετικό)",
    "postbox-submit": "Υποβολή",
    "num-comments": "Ένα σχόλιο\n{{ n }} σχόλια",
    "no-comments": "Δεν υπάρχουν σχόλια",
    "comment-reply": "Απάντηση",
    "comment-edit": "Επεξεργασία",
    "comment-save": "Αποθήκευση",
    "comment-delete": "Διαγραφή",
    "comment-confirm": "Επιβεβαίωση",
    "comment-close": "Κλείσιμο",
    "comment-cancel": "Ακύρωση",
    "comment-deleted": "Διαγραμμένο σχόλιο ",
    "comment-queued": "Το σχόλιο αναμένει έγκριση",
    "comment-anonymous": "Ανώνυμος",
    "comment-hidden": "{{ n }} Κρυμμένα",
    "date-now": "τώρα",
    "date-minute": "πριν ένα λεπτό\nπριν {{ n }} λεπτά",
    "date-hour": "πριν μία ώρα\nπριν {{ n }} ώρες",
    "date-day": "Χτες\nπριν {{ n }} μέρες",
    "date-week": "την προηγούμενη εβδομάδα\nπριν {{ n }} εβδομάδες",
    "date-month": "τον προηγούμενο μήνα\nπριν {{ n }} μήνες",
    "date-year": "πέρυσι\nπριν {{ n }} χρόνια"
});

define('app/i18n/es',{
    "postbox-text": "Escriba su comentario aquí (al menos 3 caracteres)",
    "postbox-author": "Nombre (opcional)",
    "postbox-email": "E-mail (opcional)",
    "postbox-website": "Sitio web (opcional)",
    "postbox-submit": "Enviar",
    "num-comments": "Un Comentario\n{{ n }} Comentarios",
    "no-comments": "Sin Comentarios Todavía",
    "comment-reply": "Responder",
    "comment-edit": "Editar",
    "comment-save": "Guardar",
    "comment-delete": "Eliminar",
    "comment-confirm": "Confirmar",
    "comment-close": "Cerrar",
    "comment-cancel": "Cancelar",
    "comment-deleted": "Comentario eliminado.",
    "comment-queued": "Comentario en espera para moderación.",
    "comment-anonymous": "Anónimo",
    "comment-hidden": "{{ n }} Oculto(s)",
    "date-now": "ahora",
    "date-minute": "hace un minuto\nhace {{ n }} minutos",
    "date-hour": "hace una hora\nhace {{ n }} horas",
    "date-day": "ayer\nHace {{ n }} días",
    "date-week": "la semana pasada\nhace {{ n }} semanas",
    "date-month": "el mes pasado\nhace {{ n }} meses",
    "date-year": "el año pasado\nhace {{ n }} años"
});

define('app/i18n/vi',{
    "postbox-text": "Nhập bình luận tại đây (tối thiểu 3 ký tự)",
    "postbox-author": "Tên (tùy chọn)",
    "postbox-email": "E-mail (tùy chọn)",
    "postbox-website": "Website (tùy chọn)",
    "postbox-submit": "Gửi",

    "num-comments": "Một bình luận\n{{ n }} bình luận",
    "no-comments": "Chưa có bình luận nào",

    "comment-reply": "Trả lời",
    "comment-edit": "Sửa",
    "comment-save": "Lưu",
    "comment-delete": "Xóa",
    "comment-confirm": "Xác nhận",
    "comment-close": "Đóng",
    "comment-cancel": "Hủy",
    "comment-deleted": "Đã xóa bình luận.",
    "comment-queued": "Bình luận đang chờ duyệt",
    "comment-anonymous": "Nặc danh",
    "comment-hidden": "{{ n }} đã ẩn",

    "date-now": "vừa mới",
    "date-minute": "một phút trước\n{{ n }} phút trước",
    "date-hour": "một giờ trước\n{{ n }} giờ trước",
    "date-day": "Hôm qua\n{{ n }} ngày trước",
    "date-week": "Tuần qua\n{{ n }} tuần trước",
    "date-month": "Tháng trước\n{{ n }} tháng trước",
    "date-year": "Năm trước\n{{ n }} năm trước"
});

define('app/i18n/zh_CN',{
    "postbox-text": "在此输入评论 (最少3个字符)",
    "postbox-author": "名字 (可选)",
    "postbox-email": "E-mail (可选)",
    "postbox-website": "网站 (可选)",
    "postbox-submit": "提交",

    "num-comments": "1条评论\n{{ n }}条评论",
    "no-comments": "还没有评论",

    "comment-reply": "回复",
    "comment-edit": "编辑",
    "comment-save": "保存",
    "comment-delete": "删除",
    "comment-confirm": "确认",
    "comment-close": "关闭",
    "comment-cancel": "取消",
    "comment-deleted": "评论已删除.",
    "comment-queued": "评论待审核.",
    "comment-anonymous": "匿名",
    "comment-hidden": "{{ n }} 条评论已隐藏",

    "date-now": "刚刚",
    "date-minute": "1分钟前\n{{ n }}分钟前",
    "date-hour": "1小时前\n{{ n }}小时前",
    "date-day": "昨天\n{{ n }}天前",
    "date-week": "上周\n{{ n }}周前",
    "date-month": "上个月\n{{ n }}个月前",
    "date-year": "去年\n{{ n }}年前"
});

define('app/i18n',["app/config", "app/i18n/bg", "app/i18n/cs", "app/i18n/de",
        "app/i18n/en", "app/i18n/fi", "app/i18n/fr", "app/i18n/hr",
        "app/i18n/ru", "app/i18n/it", "app/i18n/eo", "app/i18n/sv",
        "app/i18n/nl", "app/i18n/el_GR", "app/i18n/es", "app/i18n/vi",
        "app/i18n/zh_CN"],
        function(config, bg, cs, de, en, fi, fr, hr, ru, it, eo, sv, nl, el, es, vi, zh) {

    "use strict";

    var pluralforms = function(lang) {
        switch (lang) {
        case "bg":
        case "cs":
        case "de":
        case "el":
        case "en":
        case "es":
        case "eo":
        case "fi":
        case "hr":
        case "it":
        case "sv":
        case "nl":
        case "vi":
        case "zh":
            return function(msgs, n) {
                return msgs[n === 1 ? 0 : 1];
            };
        case "fr":
            return function(msgs, n) {
                return msgs[n > 1 ? 1 : 0];
            };
        case "ru":
            return function(msgs, n) {
                if (n % 10 === 1 && n % 100 !== 11) {
                    return msgs[0];
                } else if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) {
                    return msgs[1];
                } else {
                    return typeof msgs[2] !== "undefined" ? msgs[2] : msgs[1];
                }
            };
        default:
            return null;
        }
    };

    // useragent's prefered language (or manually overridden)
    var lang = config.lang;

    // fall back to English
    if (! pluralforms(lang)) {
        lang = "en";
    }

    var catalogue = {
        cs: cs,
        de: de,
        el: el,
        en: en,
        eo: eo,
        es: es,
        fi: fi,
        fr: fr,
        it: it,
        hr: hr,
        ru: ru,
        sv: sv,
        nl: nl,
        vi: vi,
        zh: zh
    };

    var plural = pluralforms(lang);

    var translate = function(msgid) {
        return catalogue[lang][msgid] || en[msgid] || "???";
    };

    var pluralize = function(msgid, n) {
        var msg;

        msg = translate(msgid);
        if (msg.indexOf("\n") > -1) {
            msg = plural(msg.split("\n"), (+ n));
        }

        return msg ? msg.replace("{{ n }}", (+ n)) : msg;
    };

    return {
        lang: lang,
        translate: translate,
        pluralize: pluralize
    };
});

define('app/count',["app/api", "app/dom", "app/i18n"], function(api, $, i18n) {
    return function() {

        var objs = {};

        $.each("a", function(el) {
            if (! el.href.match(/#isso-thread$/)) {
                return;
            }

            var tid = el.getAttribute("data-isso-id") ||
                      el.href.match(/^(.+)#isso-thread$/)[1]
                             .replace(/^.*\/\/[^\/]+/, '');

            if (tid in objs) {
                objs[tid].push(el);
            } else {
                objs[tid] = [el];
            }
        });

        var urls = Object.keys(objs);

        api.count(urls).then(function(rv) {
            for (var key in objs) {
                if (objs.hasOwnProperty(key)) {

                    var index = urls.indexOf(key);

                    for (var i = 0; i < objs[key].length; i++) {
                        objs[key][i].textContent = i18n.pluralize("num-comments", rv[index]);
                    }
                }
            }
        });
    };
});

require(["app/lib/ready", "app/count"], function(domready, count) {
    domready(function() {
        count();
    });
});

define("count", function(){});

}());