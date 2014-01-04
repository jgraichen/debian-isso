(function () {
/**
 * almond 0.2.6 Copyright (c) 2011-2012, The Dojo Foundation All Rights Reserved.
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
        aps = [].slice;

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
        var nameParts, nameSegment, mapValue, foundMap,
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
                //Convert baseName to array, and lop off the last part,
                //so that . matches that "directory" and not name of the baseName's
                //module. For instance, baseName of "one/two/three", maps to
                //"one/two/three.js", but we want the directory, "one/two" for
                //this normalization.
                baseParts = baseParts.slice(0, baseParts.length - 1);

                name = baseParts.concat(name.split("/"));

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
            return req.apply(undef, aps.call(arguments, 0).concat([relName, forceSync]));
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
            usingExports;

        //Use name if no relName
        relName = relName || name;

        //Call the callback to define the module, if necessary.
        if (typeof callback === 'function') {

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

            ret = callback.apply(defined[name], args);

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
        config = cfg;
        if (config.deps) {
            req(config.deps, config.callback);
        }
        return req;
    };

    /**
     * Expose module registry for debugging and tooling
     */
    requirejs._defined = defined;

    define = function (name, deps, callback) {

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

/**
 * @license RequireJS domReady 2.0.1 Copyright (c) 2010-2012, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/requirejs/domReady for details
 */
/*jslint */
/*global require: false, define: false, requirejs: false,
  window: false, clearInterval: false, document: false,
  self: false, setInterval: false */


define('ready',[],function () {
    

    var isTop, testDiv, scrollIntervalId,
        isBrowser = typeof window !== "undefined" && window.document,
        isPageLoaded = !isBrowser,
        doc = isBrowser ? document : null,
        readyCalls = [];

    function runCallbacks(callbacks) {
        var i;
        for (i = 0; i < callbacks.length; i += 1) {
            callbacks[i](doc);
        }
    }

    function callReady() {
        var callbacks = readyCalls;

        if (isPageLoaded) {
            //Call the DOM ready callbacks
            if (callbacks.length) {
                readyCalls = [];
                runCallbacks(callbacks);
            }
        }
    }

    /**
     * Sets the page as loaded.
     */
    function pageLoaded() {
        if (!isPageLoaded) {
            isPageLoaded = true;
            if (scrollIntervalId) {
                clearInterval(scrollIntervalId);
            }

            callReady();
        }
    }

    if (isBrowser) {
        if (document.addEventListener) {
            //Standards. Hooray! Assumption here that if standards based,
            //it knows about DOMContentLoaded.
            document.addEventListener("DOMContentLoaded", pageLoaded, false);
            window.addEventListener("load", pageLoaded, false);
        } else if (window.attachEvent) {
            window.attachEvent("onload", pageLoaded);

            testDiv = document.createElement('div');
            try {
                isTop = window.frameElement === null;
            } catch (e) {}

            //DOMContentLoaded approximation that uses a doScroll, as found by
            //Diego Perini: http://javascript.nwbox.com/IEContentLoaded/,
            //but modified by other contributors, including jdalton
            if (testDiv.doScroll && isTop && window.external) {
                scrollIntervalId = setInterval(function () {
                    try {
                        testDiv.doScroll();
                        pageLoaded();
                    } catch (e) {}
                }, 30);
            }
        }

        //Check if document already complete, and if so, just trigger page load
        //listeners. Latest webkit browsers also use "interactive", and
        //will fire the onDOMContentLoaded before "interactive" but not after
        //entering "interactive" or "complete". More details:
        //http://dev.w3.org/html5/spec/the-end.html#the-end
        //http://stackoverflow.com/questions/3665561/document-readystate-of-interactive-vs-ondomcontentloaded
        //Hmm, this is more complicated on further use, see "firing too early"
        //bug: https://github.com/requirejs/domReady/issues/1
        //so removing the || document.readyState === "interactive" test.
        //There is still a window.onload binding that should get fired if
        //DOMContentLoaded is missed.
        if (document.readyState === "complete") {
            pageLoaded();
        }
    }

    /** START OF PUBLIC API **/

    /**
     * Registers a callback for DOM ready. If DOM is already ready, the
     * callback is called immediately.
     * @param {Function} callback
     */
    function domReady(callback) {
        if (isPageLoaded) {
            callback(doc);
        } else {
            readyCalls.push(callback);
        }
        return domReady;
    }

    domReady.version = '2.0.1';

    /**
     * Loader Plugin API method
     */
    domReady.load = function (name, req, onLoad, config) {
        if (config.isBuild) {
            onLoad(null);
        } else {
            domReady(onLoad);
        }
    };

    /** END OF PUBLIC API **/

    return domReady;
});

define('app/config',[],function() {
    

    var config = {
        "css": true,
        "lang": (navigator.language || navigator.userLanguage).split("-")[0],
        "reply-to-self": false
    };

    var js = document.getElementsByTagName("script");

    for (var i = 0; i < js.length; i++) {
        [].forEach.call(js[i].attributes, function(attr) {
            if (/^data-isso-/.test(attr.name)) {
                try {
                    config[attr.name.substring(10)] = JSON.parse(attr.value);
                } catch (ex) {
                    config[attr.name.substring(10)] = attr.value;
                }
            }
        });
    }

    return config;

});

// vim:ts=4:sts=4:sw=4:
/*!
 *
 * Copyright 2009-2012 Kris Kowal under the terms of the MIT
 * license found at http://github.com/kriskowal/q/raw/master/LICENSE
 *
 * With parts by Tyler Close
 * Copyright 2007-2009 Tyler Close under the terms of the MIT X license found
 * at http://www.opensource.org/licenses/mit-license.html
 * Forked at ref_send.js version: 2009-05-11
 *
 * With parts by Mark Miller
 * Copyright (C) 2011 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

(function (definition) {
    // Turn off strict mode for this function so we can assign to global.Q
    /* jshint strict: false */

    // This file will function properly as a <script> tag, or a module
    // using CommonJS and NodeJS or RequireJS module formats.  In
    // Common/Node/RequireJS, the module exports the Q API and when
    // executed as a simple <script>, it creates a Q global instead.

    // Montage Require
    if (typeof bootstrap === "function") {
        bootstrap("promise", definition);

    // CommonJS
    } else if (typeof exports === "object") {
        module.exports = definition();

    // RequireJS
    } else if (typeof define === "function" && define.amd) {
        define('q',definition);

    // SES (Secure EcmaScript)
    } else if (typeof ses !== "undefined") {
        if (!ses.ok()) {
            return;
        } else {
            ses.makeQ = definition;
        }

    // <script>
    } else {
        Q = definition();
    }

})(function () {


var hasStacks = false;
try {
    throw new Error();
} catch (e) {
    hasStacks = !!e.stack;
}

// All code after this point will be filtered from stack traces reported
// by Q.
var qStartingLine = captureLine();
var qFileName;

// shims

// used for fallback in "allResolved"
var noop = function () {};

// Use the fastest possible means to execute a task in a future turn
// of the event loop.
var nextTick =(function () {
    // linked list of tasks (single, with head node)
    var head = {task: void 0, next: null};
    var tail = head;
    var flushing = false;
    var requestTick = void 0;
    var isNodeJS = false;

    function flush() {
        /* jshint loopfunc: true */

        while (head.next) {
            head = head.next;
            var task = head.task;
            head.task = void 0;
            var domain = head.domain;

            if (domain) {
                head.domain = void 0;
                domain.enter();
            }

            try {
                task();

            } catch (e) {
                if (isNodeJS) {
                    // In node, uncaught exceptions are considered fatal errors.
                    // Re-throw them synchronously to interrupt flushing!

                    // Ensure continuation if the uncaught exception is suppressed
                    // listening "uncaughtException" events (as domains does).
                    // Continue in next event to avoid tick recursion.
                    if (domain) {
                        domain.exit();
                    }
                    setTimeout(flush, 0);
                    if (domain) {
                        domain.enter();
                    }

                    throw e;

                } else {
                    // In browsers, uncaught exceptions are not fatal.
                    // Re-throw them asynchronously to avoid slow-downs.
                    setTimeout(function() {
                       throw e;
                    }, 0);
                }
            }

            if (domain) {
                domain.exit();
            }
        }

        flushing = false;
    }

    nextTick = function (task) {
        tail = tail.next = {
            task: task,
            domain: isNodeJS && process.domain,
            next: null
        };

        if (!flushing) {
            flushing = true;
            requestTick();
        }
    };

    if (typeof process !== "undefined" && process.nextTick) {
        // Node.js before 0.9. Note that some fake-Node environments, like the
        // Mocha test runner, introduce a `process` global without a `nextTick`.
        isNodeJS = true;

        requestTick = function () {
            process.nextTick(flush);
        };

    } else if (typeof setImmediate === "function") {
        // In IE10, Node.js 0.9+, or https://github.com/NobleJS/setImmediate
        if (typeof window !== "undefined") {
            requestTick = setImmediate.bind(window, flush);
        } else {
            requestTick = function () {
                setImmediate(flush);
            };
        }

    } else if (typeof MessageChannel !== "undefined") {
        // modern browsers
        // http://www.nonblocking.io/2011/06/windownexttick.html
        var channel = new MessageChannel();
        // At least Safari Version 6.0.5 (8536.30.1) intermittently cannot create
        // working message ports the first time a page loads.
        channel.port1.onmessage = function () {
            requestTick = requestPortTick;
            channel.port1.onmessage = flush;
            flush();
        };
        var requestPortTick = function () {
            // Opera requires us to provide a message payload, regardless of
            // whether we use it.
            channel.port2.postMessage(0);
        };
        requestTick = function () {
            setTimeout(flush, 0);
            requestPortTick();
        };

    } else {
        // old browsers
        requestTick = function () {
            setTimeout(flush, 0);
        };
    }

    return nextTick;
})();

// Attempt to make generics safe in the face of downstream
// modifications.
// There is no situation where this is necessary.
// If you need a security guarantee, these primordials need to be
// deeply frozen anyway, and if you don’t need a security guarantee,
// this is just plain paranoid.
// However, this does have the nice side-effect of reducing the size
// of the code by reducing x.call() to merely x(), eliminating many
// hard-to-minify characters.
// See Mark Miller’s explanation of what this does.
// http://wiki.ecmascript.org/doku.php?id=conventions:safe_meta_programming
var call = Function.call;
function uncurryThis(f) {
    return function () {
        return call.apply(f, arguments);
    };
}
// This is equivalent, but slower:
// uncurryThis = Function_bind.bind(Function_bind.call);
// http://jsperf.com/uncurrythis

var array_slice = uncurryThis(Array.prototype.slice);

var array_reduce = uncurryThis(
    Array.prototype.reduce || function (callback, basis) {
        var index = 0,
            length = this.length;
        // concerning the initial value, if one is not provided
        if (arguments.length === 1) {
            // seek to the first value in the array, accounting
            // for the possibility that is is a sparse array
            do {
                if (index in this) {
                    basis = this[index++];
                    break;
                }
                if (++index >= length) {
                    throw new TypeError();
                }
            } while (1);
        }
        // reduce
        for (; index < length; index++) {
            // account for the possibility that the array is sparse
            if (index in this) {
                basis = callback(basis, this[index], index);
            }
        }
        return basis;
    }
);

var array_indexOf = uncurryThis(
    Array.prototype.indexOf || function (value) {
        // not a very good shim, but good enough for our one use of it
        for (var i = 0; i < this.length; i++) {
            if (this[i] === value) {
                return i;
            }
        }
        return -1;
    }
);

var array_map = uncurryThis(
    Array.prototype.map || function (callback, thisp) {
        var self = this;
        var collect = [];
        array_reduce(self, function (undefined, value, index) {
            collect.push(callback.call(thisp, value, index, self));
        }, void 0);
        return collect;
    }
);

var object_create = Object.create || function (prototype) {
    function Type() { }
    Type.prototype = prototype;
    return new Type();
};

var object_hasOwnProperty = uncurryThis(Object.prototype.hasOwnProperty);

var object_keys = Object.keys || function (object) {
    var keys = [];
    for (var key in object) {
        if (object_hasOwnProperty(object, key)) {
            keys.push(key);
        }
    }
    return keys;
};

var object_toString = uncurryThis(Object.prototype.toString);

function isObject(value) {
    return value === Object(value);
}

// generator related shims

// FIXME: Remove this function once ES6 generators are in SpiderMonkey.
function isStopIteration(exception) {
    return (
        object_toString(exception) === "[object StopIteration]" ||
        exception instanceof QReturnValue
    );
}

// FIXME: Remove this helper and Q.return once ES6 generators are in
// SpiderMonkey.
var QReturnValue;
if (typeof ReturnValue !== "undefined") {
    QReturnValue = ReturnValue;
} else {
    QReturnValue = function (value) {
        this.value = value;
    };
}

// Until V8 3.19 / Chromium 29 is released, SpiderMonkey is the only
// engine that has a deployed base of browsers that support generators.
// However, SM's generators use the Python-inspired semantics of
// outdated ES6 drafts.  We would like to support ES6, but we'd also
// like to make it possible to use generators in deployed browsers, so
// we also support Python-style generators.  At some point we can remove
// this block.
var hasES6Generators;
try {
    /* jshint evil: true, nonew: false */
    new Function("(function* (){ yield 1; })");
    hasES6Generators = true;
} catch (e) {
    hasES6Generators = false;
}

// long stack traces

var STACK_JUMP_SEPARATOR = "From previous event:";

function makeStackTraceLong(error, promise) {
    // If possible, transform the error stack trace by removing Node and Q
    // cruft, then concatenating with the stack trace of `promise`. See #57.
    if (hasStacks &&
        promise.stack &&
        typeof error === "object" &&
        error !== null &&
        error.stack &&
        error.stack.indexOf(STACK_JUMP_SEPARATOR) === -1
    ) {
        var stacks = [];
        for (var p = promise; !!p; p = p.source) {
            if (p.stack) {
                stacks.unshift(p.stack);
            }
        }
        stacks.unshift(error.stack);

        var concatedStacks = stacks.join("\n" + STACK_JUMP_SEPARATOR + "\n");
        error.stack = filterStackString(concatedStacks);
    }
}

function filterStackString(stackString) {
    var lines = stackString.split("\n");
    var desiredLines = [];
    for (var i = 0; i < lines.length; ++i) {
        var line = lines[i];

        if (!isInternalFrame(line) && !isNodeFrame(line) && line) {
            desiredLines.push(line);
        }
    }
    return desiredLines.join("\n");
}

function isNodeFrame(stackLine) {
    return stackLine.indexOf("(module.js:") !== -1 ||
           stackLine.indexOf("(node.js:") !== -1;
}

function getFileNameAndLineNumber(stackLine) {
    // Named functions: "at functionName (filename:lineNumber:columnNumber)"
    // In IE10 function name can have spaces ("Anonymous function") O_o
    var attempt1 = /at .+ \((.+):(\d+):(?:\d+)\)$/.exec(stackLine);
    if (attempt1) {
        return [attempt1[1], Number(attempt1[2])];
    }

    // Anonymous functions: "at filename:lineNumber:columnNumber"
    var attempt2 = /at ([^ ]+):(\d+):(?:\d+)$/.exec(stackLine);
    if (attempt2) {
        return [attempt2[1], Number(attempt2[2])];
    }

    // Firefox style: "function@filename:lineNumber or @filename:lineNumber"
    var attempt3 = /.*@(.+):(\d+)$/.exec(stackLine);
    if (attempt3) {
        return [attempt3[1], Number(attempt3[2])];
    }
}

function isInternalFrame(stackLine) {
    var fileNameAndLineNumber = getFileNameAndLineNumber(stackLine);

    if (!fileNameAndLineNumber) {
        return false;
    }

    var fileName = fileNameAndLineNumber[0];
    var lineNumber = fileNameAndLineNumber[1];

    return fileName === qFileName &&
        lineNumber >= qStartingLine &&
        lineNumber <= qEndingLine;
}

// discover own file name and line number range for filtering stack
// traces
function captureLine() {
    if (!hasStacks) {
        return;
    }

    try {
        throw new Error();
    } catch (e) {
        var lines = e.stack.split("\n");
        var firstLine = lines[0].indexOf("@") > 0 ? lines[1] : lines[2];
        var fileNameAndLineNumber = getFileNameAndLineNumber(firstLine);
        if (!fileNameAndLineNumber) {
            return;
        }

        qFileName = fileNameAndLineNumber[0];
        return fileNameAndLineNumber[1];
    }
}

function deprecate(callback, name, alternative) {
    return function () {
        if (typeof console !== "undefined" &&
            typeof console.warn === "function") {
            console.warn(name + " is deprecated, use " + alternative +
                         " instead.", new Error("").stack);
        }
        return callback.apply(callback, arguments);
    };
}

// end of shims
// beginning of real work

/**
 * Constructs a promise for an immediate reference, passes promises through, or
 * coerces promises from different systems.
 * @param value immediate reference or promise
 */
function Q(value) {
    // If the object is already a Promise, return it directly.  This enables
    // the resolve function to both be used to created references from objects,
    // but to tolerably coerce non-promises to promises.
    if (isPromise(value)) {
        return value;
    }

    // assimilate thenables
    if (isPromiseAlike(value)) {
        return coerce(value);
    } else {
        return fulfill(value);
    }
}
Q.resolve = Q;

/**
 * Performs a task in a future turn of the event loop.
 * @param {Function} task
 */
Q.nextTick = nextTick;

/**
 * Controls whether or not long stack traces will be on
 */
Q.longStackSupport = false;

/**
 * Constructs a {promise, resolve, reject} object.
 *
 * `resolve` is a callback to invoke with a more resolved value for the
 * promise. To fulfill the promise, invoke `resolve` with any value that is
 * not a thenable. To reject the promise, invoke `resolve` with a rejected
 * thenable, or invoke `reject` with the reason directly. To resolve the
 * promise to another thenable, thus putting it in the same state, invoke
 * `resolve` with that other thenable.
 */
Q.defer = defer;
function defer() {
    // if "messages" is an "Array", that indicates that the promise has not yet
    // been resolved.  If it is "undefined", it has been resolved.  Each
    // element of the messages array is itself an array of complete arguments to
    // forward to the resolved promise.  We coerce the resolution value to a
    // promise using the `resolve` function because it handles both fully
    // non-thenable values and other thenables gracefully.
    var messages = [], progressListeners = [], resolvedPromise;

    var deferred = object_create(defer.prototype);
    var promise = object_create(Promise.prototype);

    promise.promiseDispatch = function (resolve, op, operands) {
        var args = array_slice(arguments);
        if (messages) {
            messages.push(args);
            if (op === "when" && operands[1]) { // progress operand
                progressListeners.push(operands[1]);
            }
        } else {
            nextTick(function () {
                resolvedPromise.promiseDispatch.apply(resolvedPromise, args);
            });
        }
    };

    // XXX deprecated
    promise.valueOf = deprecate(function () {
        if (messages) {
            return promise;
        }
        var nearerValue = nearer(resolvedPromise);
        if (isPromise(nearerValue)) {
            resolvedPromise = nearerValue; // shorten chain
        }
        return nearerValue;
    }, "valueOf", "inspect");

    promise.inspect = function () {
        if (!resolvedPromise) {
            return { state: "pending" };
        }
        return resolvedPromise.inspect();
    };

    if (Q.longStackSupport && hasStacks) {
        try {
            throw new Error();
        } catch (e) {
            // NOTE: don't try to use `Error.captureStackTrace` or transfer the
            // accessor around; that causes memory leaks as per GH-111. Just
            // reify the stack trace as a string ASAP.
            //
            // At the same time, cut off the first line; it's always just
            // "[object Promise]\n", as per the `toString`.
            promise.stack = e.stack.substring(e.stack.indexOf("\n") + 1);
        }
    }

    // NOTE: we do the checks for `resolvedPromise` in each method, instead of
    // consolidating them into `become`, since otherwise we'd create new
    // promises with the lines `become(whatever(value))`. See e.g. GH-252.

    function become(newPromise) {
        resolvedPromise = newPromise;
        promise.source = newPromise;

        array_reduce(messages, function (undefined, message) {
            nextTick(function () {
                newPromise.promiseDispatch.apply(newPromise, message);
            });
        }, void 0);

        messages = void 0;
        progressListeners = void 0;
    }

    deferred.promise = promise;
    deferred.resolve = function (value) {
        if (resolvedPromise) {
            return;
        }

        become(Q(value));
    };

    deferred.fulfill = function (value) {
        if (resolvedPromise) {
            return;
        }

        become(fulfill(value));
    };
    deferred.reject = function (reason) {
        if (resolvedPromise) {
            return;
        }

        become(reject(reason));
    };
    deferred.notify = function (progress) {
        if (resolvedPromise) {
            return;
        }

        array_reduce(progressListeners, function (undefined, progressListener) {
            nextTick(function () {
                progressListener(progress);
            });
        }, void 0);
    };

    return deferred;
}

/**
 * Creates a Node-style callback that will resolve or reject the deferred
 * promise.
 * @returns a nodeback
 */
defer.prototype.makeNodeResolver = function () {
    var self = this;
    return function (error, value) {
        if (error) {
            self.reject(error);
        } else if (arguments.length > 2) {
            self.resolve(array_slice(arguments, 1));
        } else {
            self.resolve(value);
        }
    };
};

/**
 * @param resolver {Function} a function that returns nothing and accepts
 * the resolve, reject, and notify functions for a deferred.
 * @returns a promise that may be resolved with the given resolve and reject
 * functions, or rejected by a thrown exception in resolver
 */
Q.promise = promise;
function promise(resolver) {
    if (typeof resolver !== "function") {
        throw new TypeError("resolver must be a function.");
    }
    var deferred = defer();
    try {
        resolver(deferred.resolve, deferred.reject, deferred.notify);
    } catch (reason) {
        deferred.reject(reason);
    }
    return deferred.promise;
}

// XXX experimental.  This method is a way to denote that a local value is
// serializable and should be immediately dispatched to a remote upon request,
// instead of passing a reference.
Q.passByCopy = function (object) {
    //freeze(object);
    //passByCopies.set(object, true);
    return object;
};

Promise.prototype.passByCopy = function () {
    //freeze(object);
    //passByCopies.set(object, true);
    return this;
};

/**
 * If two promises eventually fulfill to the same value, promises that value,
 * but otherwise rejects.
 * @param x {Any*}
 * @param y {Any*}
 * @returns {Any*} a promise for x and y if they are the same, but a rejection
 * otherwise.
 *
 */
Q.join = function (x, y) {
    return Q(x).join(y);
};

Promise.prototype.join = function (that) {
    return Q([this, that]).spread(function (x, y) {
        if (x === y) {
            // TODO: "===" should be Object.is or equiv
            return x;
        } else {
            throw new Error("Can't join: not the same: " + x + " " + y);
        }
    });
};

/**
 * Returns a promise for the first of an array of promises to become fulfilled.
 * @param answers {Array[Any*]} promises to race
 * @returns {Any*} the first promise to be fulfilled
 */
Q.race = race;
function race(answerPs) {
    return promise(function(resolve, reject) {
        // Switch to this once we can assume at least ES5
        // answerPs.forEach(function(answerP) {
        //     Q(answerP).then(resolve, reject);
        // });
        // Use this in the meantime
        for (var i = 0, len = answerPs.length; i < len; i++) {
            Q(answerPs[i]).then(resolve, reject);
        }
    });
}

Promise.prototype.race = function () {
    return this.then(Q.race);
};

/**
 * Constructs a Promise with a promise descriptor object and optional fallback
 * function.  The descriptor contains methods like when(rejected), get(name),
 * set(name, value), post(name, args), and delete(name), which all
 * return either a value, a promise for a value, or a rejection.  The fallback
 * accepts the operation name, a resolver, and any further arguments that would
 * have been forwarded to the appropriate method above had a method been
 * provided with the proper name.  The API makes no guarantees about the nature
 * of the returned object, apart from that it is usable whereever promises are
 * bought and sold.
 */
Q.makePromise = Promise;
function Promise(descriptor, fallback, inspect) {
    if (fallback === void 0) {
        fallback = function (op) {
            return reject(new Error(
                "Promise does not support operation: " + op
            ));
        };
    }
    if (inspect === void 0) {
        inspect = function () {
            return {state: "unknown"};
        };
    }

    var promise = object_create(Promise.prototype);

    promise.promiseDispatch = function (resolve, op, args) {
        var result;
        try {
            if (descriptor[op]) {
                result = descriptor[op].apply(promise, args);
            } else {
                result = fallback.call(promise, op, args);
            }
        } catch (exception) {
            result = reject(exception);
        }
        if (resolve) {
            resolve(result);
        }
    };

    promise.inspect = inspect;

    // XXX deprecated `valueOf` and `exception` support
    if (inspect) {
        var inspected = inspect();
        if (inspected.state === "rejected") {
            promise.exception = inspected.reason;
        }

        promise.valueOf = deprecate(function () {
            var inspected = inspect();
            if (inspected.state === "pending" ||
                inspected.state === "rejected") {
                return promise;
            }
            return inspected.value;
        });
    }

    return promise;
}

Promise.prototype.toString = function () {
    return "[object Promise]";
};

Promise.prototype.then = function (fulfilled, rejected, progressed) {
    var self = this;
    var deferred = defer();
    var done = false;   // ensure the untrusted promise makes at most a
                        // single call to one of the callbacks

    function _fulfilled(value) {
        try {
            return typeof fulfilled === "function" ? fulfilled(value) : value;
        } catch (exception) {
            return reject(exception);
        }
    }

    function _rejected(exception) {
        if (typeof rejected === "function") {
            makeStackTraceLong(exception, self);
            try {
                return rejected(exception);
            } catch (newException) {
                return reject(newException);
            }
        }
        return reject(exception);
    }

    function _progressed(value) {
        return typeof progressed === "function" ? progressed(value) : value;
    }

    nextTick(function () {
        self.promiseDispatch(function (value) {
            if (done) {
                return;
            }
            done = true;

            deferred.resolve(_fulfilled(value));
        }, "when", [function (exception) {
            if (done) {
                return;
            }
            done = true;

            deferred.resolve(_rejected(exception));
        }]);
    });

    // Progress propagator need to be attached in the current tick.
    self.promiseDispatch(void 0, "when", [void 0, function (value) {
        var newValue;
        var threw = false;
        try {
            newValue = _progressed(value);
        } catch (e) {
            threw = true;
            if (Q.onerror) {
                Q.onerror(e);
            } else {
                throw e;
            }
        }

        if (!threw) {
            deferred.notify(newValue);
        }
    }]);

    return deferred.promise;
};

/**
 * Registers an observer on a promise.
 *
 * Guarantees:
 *
 * 1. that fulfilled and rejected will be called only once.
 * 2. that either the fulfilled callback or the rejected callback will be
 *    called, but not both.
 * 3. that fulfilled and rejected will not be called in this turn.
 *
 * @param value      promise or immediate reference to observe
 * @param fulfilled  function to be called with the fulfilled value
 * @param rejected   function to be called with the rejection exception
 * @param progressed function to be called on any progress notifications
 * @return promise for the return value from the invoked callback
 */
Q.when = when;
function when(value, fulfilled, rejected, progressed) {
    return Q(value).then(fulfilled, rejected, progressed);
}

Promise.prototype.thenResolve = function (value) {
    return this.then(function () { return value; });
};

Q.thenResolve = function (promise, value) {
    return Q(promise).thenResolve(value);
};

Promise.prototype.thenReject = function (reason) {
    return this.then(function () { throw reason; });
};

Q.thenReject = function (promise, reason) {
    return Q(promise).thenReject(reason);
};

/**
 * If an object is not a promise, it is as "near" as possible.
 * If a promise is rejected, it is as "near" as possible too.
 * If it’s a fulfilled promise, the fulfillment value is nearer.
 * If it’s a deferred promise and the deferred has been resolved, the
 * resolution is "nearer".
 * @param object
 * @returns most resolved (nearest) form of the object
 */

// XXX should we re-do this?
Q.nearer = nearer;
function nearer(value) {
    if (isPromise(value)) {
        var inspected = value.inspect();
        if (inspected.state === "fulfilled") {
            return inspected.value;
        }
    }
    return value;
}

/**
 * @returns whether the given object is a promise.
 * Otherwise it is a fulfilled value.
 */
Q.isPromise = isPromise;
function isPromise(object) {
    return isObject(object) &&
        typeof object.promiseDispatch === "function" &&
        typeof object.inspect === "function";
}

Q.isPromiseAlike = isPromiseAlike;
function isPromiseAlike(object) {
    return isObject(object) && typeof object.then === "function";
}

/**
 * @returns whether the given object is a pending promise, meaning not
 * fulfilled or rejected.
 */
Q.isPending = isPending;
function isPending(object) {
    return isPromise(object) && object.inspect().state === "pending";
}

Promise.prototype.isPending = function () {
    return this.inspect().state === "pending";
};

/**
 * @returns whether the given object is a value or fulfilled
 * promise.
 */
Q.isFulfilled = isFulfilled;
function isFulfilled(object) {
    return !isPromise(object) || object.inspect().state === "fulfilled";
}

Promise.prototype.isFulfilled = function () {
    return this.inspect().state === "fulfilled";
};

/**
 * @returns whether the given object is a rejected promise.
 */
Q.isRejected = isRejected;
function isRejected(object) {
    return isPromise(object) && object.inspect().state === "rejected";
}

Promise.prototype.isRejected = function () {
    return this.inspect().state === "rejected";
};

//// BEGIN UNHANDLED REJECTION TRACKING

// This promise library consumes exceptions thrown in handlers so they can be
// handled by a subsequent promise.  The exceptions get added to this array when
// they are created, and removed when they are handled.  Note that in ES6 or
// shimmed environments, this would naturally be a `Set`.
var unhandledReasons = [];
var unhandledRejections = [];
var unhandledReasonsDisplayed = false;
var trackUnhandledRejections = true;
function displayUnhandledReasons() {
    if (
        !unhandledReasonsDisplayed &&
        typeof window !== "undefined" &&
        !window.Touch &&
        window.console
    ) {
        console.warn("[Q] Unhandled rejection reasons (should be empty):",
                     unhandledReasons);
    }

    unhandledReasonsDisplayed = true;
}

function logUnhandledReasons() {
    for (var i = 0; i < unhandledReasons.length; i++) {
        var reason = unhandledReasons[i];
        console.warn("Unhandled rejection reason:", reason);
    }
}

function resetUnhandledRejections() {
    unhandledReasons.length = 0;
    unhandledRejections.length = 0;
    unhandledReasonsDisplayed = false;

    if (!trackUnhandledRejections) {
        trackUnhandledRejections = true;

        // Show unhandled rejection reasons if Node exits without handling an
        // outstanding rejection.  (Note that Browserify presently produces a
        // `process` global without the `EventEmitter` `on` method.)
        if (typeof process !== "undefined" && process.on) {
            process.on("exit", logUnhandledReasons);
        }
    }
}

function trackRejection(promise, reason) {
    if (!trackUnhandledRejections) {
        return;
    }

    unhandledRejections.push(promise);
    if (reason && typeof reason.stack !== "undefined") {
        unhandledReasons.push(reason.stack);
    } else {
        unhandledReasons.push("(no stack) " + reason);
    }
    displayUnhandledReasons();
}

function untrackRejection(promise) {
    if (!trackUnhandledRejections) {
        return;
    }

    var at = array_indexOf(unhandledRejections, promise);
    if (at !== -1) {
        unhandledRejections.splice(at, 1);
        unhandledReasons.splice(at, 1);
    }
}

Q.resetUnhandledRejections = resetUnhandledRejections;

Q.getUnhandledReasons = function () {
    // Make a copy so that consumers can't interfere with our internal state.
    return unhandledReasons.slice();
};

Q.stopUnhandledRejectionTracking = function () {
    resetUnhandledRejections();
    if (typeof process !== "undefined" && process.on) {
        process.removeListener("exit", logUnhandledReasons);
    }
    trackUnhandledRejections = false;
};

resetUnhandledRejections();

//// END UNHANDLED REJECTION TRACKING

/**
 * Constructs a rejected promise.
 * @param reason value describing the failure
 */
Q.reject = reject;
function reject(reason) {
    var rejection = Promise({
        "when": function (rejected) {
            // note that the error has been handled
            if (rejected) {
                untrackRejection(this);
            }
            return rejected ? rejected(reason) : this;
        }
    }, function fallback() {
        return this;
    }, function inspect() {
        return { state: "rejected", reason: reason };
    });

    // Note that the reason has not been handled.
    trackRejection(rejection, reason);

    return rejection;
}

/**
 * Constructs a fulfilled promise for an immediate reference.
 * @param value immediate reference
 */
Q.fulfill = fulfill;
function fulfill(value) {
    return Promise({
        "when": function () {
            return value;
        },
        "get": function (name) {
            return value[name];
        },
        "set": function (name, rhs) {
            value[name] = rhs;
        },
        "delete": function (name) {
            delete value[name];
        },
        "post": function (name, args) {
            // Mark Miller proposes that post with no name should apply a
            // promised function.
            if (name === null || name === void 0) {
                return value.apply(void 0, args);
            } else {
                return value[name].apply(value, args);
            }
        },
        "apply": function (thisp, args) {
            return value.apply(thisp, args);
        },
        "keys": function () {
            return object_keys(value);
        }
    }, void 0, function inspect() {
        return { state: "fulfilled", value: value };
    });
}

/**
 * Converts thenables to Q promises.
 * @param promise thenable promise
 * @returns a Q promise
 */
function coerce(promise) {
    var deferred = defer();
    nextTick(function () {
        try {
            promise.then(deferred.resolve, deferred.reject, deferred.notify);
        } catch (exception) {
            deferred.reject(exception);
        }
    });
    return deferred.promise;
}

/**
 * Annotates an object such that it will never be
 * transferred away from this process over any promise
 * communication channel.
 * @param object
 * @returns promise a wrapping of that object that
 * additionally responds to the "isDef" message
 * without a rejection.
 */
Q.master = master;
function master(object) {
    return Promise({
        "isDef": function () {}
    }, function fallback(op, args) {
        return dispatch(object, op, args);
    }, function () {
        return Q(object).inspect();
    });
}

/**
 * Spreads the values of a promised array of arguments into the
 * fulfillment callback.
 * @param fulfilled callback that receives variadic arguments from the
 * promised array
 * @param rejected callback that receives the exception if the promise
 * is rejected.
 * @returns a promise for the return value or thrown exception of
 * either callback.
 */
Q.spread = spread;
function spread(value, fulfilled, rejected) {
    return Q(value).spread(fulfilled, rejected);
}

Promise.prototype.spread = function (fulfilled, rejected) {
    return this.all().then(function (array) {
        return fulfilled.apply(void 0, array);
    }, rejected);
};

/**
 * The async function is a decorator for generator functions, turning
 * them into asynchronous generators.  Although generators are only part
 * of the newest ECMAScript 6 drafts, this code does not cause syntax
 * errors in older engines.  This code should continue to work and will
 * in fact improve over time as the language improves.
 *
 * ES6 generators are currently part of V8 version 3.19 with the
 * --harmony-generators runtime flag enabled.  SpiderMonkey has had them
 * for longer, but under an older Python-inspired form.  This function
 * works on both kinds of generators.
 *
 * Decorates a generator function such that:
 *  - it may yield promises
 *  - execution will continue when that promise is fulfilled
 *  - the value of the yield expression will be the fulfilled value
 *  - it returns a promise for the return value (when the generator
 *    stops iterating)
 *  - the decorated function returns a promise for the return value
 *    of the generator or the first rejected promise among those
 *    yielded.
 *  - if an error is thrown in the generator, it propagates through
 *    every following yield until it is caught, or until it escapes
 *    the generator function altogether, and is translated into a
 *    rejection for the promise returned by the decorated generator.
 */
Q.async = async;
function async(makeGenerator) {
    return function () {
        // when verb is "send", arg is a value
        // when verb is "throw", arg is an exception
        function continuer(verb, arg) {
            var result;
            if (hasES6Generators) {
                try {
                    result = generator[verb](arg);
                } catch (exception) {
                    return reject(exception);
                }
                if (result.done) {
                    return result.value;
                } else {
                    return when(result.value, callback, errback);
                }
            } else {
                // FIXME: Remove this case when SM does ES6 generators.
                try {
                    result = generator[verb](arg);
                } catch (exception) {
                    if (isStopIteration(exception)) {
                        return exception.value;
                    } else {
                        return reject(exception);
                    }
                }
                return when(result, callback, errback);
            }
        }
        var generator = makeGenerator.apply(this, arguments);
        var callback = continuer.bind(continuer, "next");
        var errback = continuer.bind(continuer, "throw");
        return callback();
    };
}

/**
 * The spawn function is a small wrapper around async that immediately
 * calls the generator and also ends the promise chain, so that any
 * unhandled errors are thrown instead of forwarded to the error
 * handler. This is useful because it's extremely common to run
 * generators at the top-level to work with libraries.
 */
Q.spawn = spawn;
function spawn(makeGenerator) {
    Q.done(Q.async(makeGenerator)());
}

// FIXME: Remove this interface once ES6 generators are in SpiderMonkey.
/**
 * Throws a ReturnValue exception to stop an asynchronous generator.
 *
 * This interface is a stop-gap measure to support generator return
 * values in older Firefox/SpiderMonkey.  In browsers that support ES6
 * generators like Chromium 29, just use "return" in your generator
 * functions.
 *
 * @param value the return value for the surrounding generator
 * @throws ReturnValue exception with the value.
 * @example
 * // ES6 style
 * Q.async(function* () {
 *      var foo = yield getFooPromise();
 *      var bar = yield getBarPromise();
 *      return foo + bar;
 * })
 * // Older SpiderMonkey style
 * Q.async(function () {
 *      var foo = yield getFooPromise();
 *      var bar = yield getBarPromise();
 *      Q.return(foo + bar);
 * })
 */
Q["return"] = _return;
function _return(value) {
    throw new QReturnValue(value);
}

/**
 * The promised function decorator ensures that any promise arguments
 * are settled and passed as values (`this` is also settled and passed
 * as a value).  It will also ensure that the result of a function is
 * always a promise.
 *
 * @example
 * var add = Q.promised(function (a, b) {
 *     return a + b;
 * });
 * add(Q(a), Q(B));
 *
 * @param {function} callback The function to decorate
 * @returns {function} a function that has been decorated.
 */
Q.promised = promised;
function promised(callback) {
    return function () {
        return spread([this, all(arguments)], function (self, args) {
            return callback.apply(self, args);
        });
    };
}

/**
 * sends a message to a value in a future turn
 * @param object* the recipient
 * @param op the name of the message operation, e.g., "when",
 * @param args further arguments to be forwarded to the operation
 * @returns result {Promise} a promise for the result of the operation
 */
Q.dispatch = dispatch;
function dispatch(object, op, args) {
    return Q(object).dispatch(op, args);
}

Promise.prototype.dispatch = function (op, args) {
    var self = this;
    var deferred = defer();
    nextTick(function () {
        self.promiseDispatch(deferred.resolve, op, args);
    });
    return deferred.promise;
};

/**
 * Gets the value of a property in a future turn.
 * @param object    promise or immediate reference for target object
 * @param name      name of property to get
 * @return promise for the property value
 */
Q.get = function (object, key) {
    return Q(object).dispatch("get", [key]);
};

Promise.prototype.get = function (key) {
    return this.dispatch("get", [key]);
};

/**
 * Sets the value of a property in a future turn.
 * @param object    promise or immediate reference for object object
 * @param name      name of property to set
 * @param value     new value of property
 * @return promise for the return value
 */
Q.set = function (object, key, value) {
    return Q(object).dispatch("set", [key, value]);
};

Promise.prototype.set = function (key, value) {
    return this.dispatch("set", [key, value]);
};

/**
 * Deletes a property in a future turn.
 * @param object    promise or immediate reference for target object
 * @param name      name of property to delete
 * @return promise for the return value
 */
Q.del = // XXX legacy
Q["delete"] = function (object, key) {
    return Q(object).dispatch("delete", [key]);
};

Promise.prototype.del = // XXX legacy
Promise.prototype["delete"] = function (key) {
    return this.dispatch("delete", [key]);
};

/**
 * Invokes a method in a future turn.
 * @param object    promise or immediate reference for target object
 * @param name      name of method to invoke
 * @param value     a value to post, typically an array of
 *                  invocation arguments for promises that
 *                  are ultimately backed with `resolve` values,
 *                  as opposed to those backed with URLs
 *                  wherein the posted value can be any
 *                  JSON serializable object.
 * @return promise for the return value
 */
// bound locally because it is used by other methods
Q.mapply = // XXX As proposed by "Redsandro"
Q.post = function (object, name, args) {
    return Q(object).dispatch("post", [name, args]);
};

Promise.prototype.mapply = // XXX As proposed by "Redsandro"
Promise.prototype.post = function (name, args) {
    return this.dispatch("post", [name, args]);
};

/**
 * Invokes a method in a future turn.
 * @param object    promise or immediate reference for target object
 * @param name      name of method to invoke
 * @param ...args   array of invocation arguments
 * @return promise for the return value
 */
Q.send = // XXX Mark Miller's proposed parlance
Q.mcall = // XXX As proposed by "Redsandro"
Q.invoke = function (object, name /*...args*/) {
    return Q(object).dispatch("post", [name, array_slice(arguments, 2)]);
};

Promise.prototype.send = // XXX Mark Miller's proposed parlance
Promise.prototype.mcall = // XXX As proposed by "Redsandro"
Promise.prototype.invoke = function (name /*...args*/) {
    return this.dispatch("post", [name, array_slice(arguments, 1)]);
};

/**
 * Applies the promised function in a future turn.
 * @param object    promise or immediate reference for target function
 * @param args      array of application arguments
 */
Q.fapply = function (object, args) {
    return Q(object).dispatch("apply", [void 0, args]);
};

Promise.prototype.fapply = function (args) {
    return this.dispatch("apply", [void 0, args]);
};

/**
 * Calls the promised function in a future turn.
 * @param object    promise or immediate reference for target function
 * @param ...args   array of application arguments
 */
Q["try"] =
Q.fcall = function (object /* ...args*/) {
    return Q(object).dispatch("apply", [void 0, array_slice(arguments, 1)]);
};

Promise.prototype.fcall = function (/*...args*/) {
    return this.dispatch("apply", [void 0, array_slice(arguments)]);
};

/**
 * Binds the promised function, transforming return values into a fulfilled
 * promise and thrown errors into a rejected one.
 * @param object    promise or immediate reference for target function
 * @param ...args   array of application arguments
 */
Q.fbind = function (object /*...args*/) {
    var promise = Q(object);
    var args = array_slice(arguments, 1);
    return function fbound() {
        return promise.dispatch("apply", [
            this,
            args.concat(array_slice(arguments))
        ]);
    };
};
Promise.prototype.fbind = function (/*...args*/) {
    var promise = this;
    var args = array_slice(arguments);
    return function fbound() {
        return promise.dispatch("apply", [
            this,
            args.concat(array_slice(arguments))
        ]);
    };
};

/**
 * Requests the names of the owned properties of a promised
 * object in a future turn.
 * @param object    promise or immediate reference for target object
 * @return promise for the keys of the eventually settled object
 */
Q.keys = function (object) {
    return Q(object).dispatch("keys", []);
};

Promise.prototype.keys = function () {
    return this.dispatch("keys", []);
};

/**
 * Turns an array of promises into a promise for an array.  If any of
 * the promises gets rejected, the whole array is rejected immediately.
 * @param {Array*} an array (or promise for an array) of values (or
 * promises for values)
 * @returns a promise for an array of the corresponding values
 */
// By Mark Miller
// http://wiki.ecmascript.org/doku.php?id=strawman:concurrency&rev=1308776521#allfulfilled
Q.all = all;
function all(promises) {
    return when(promises, function (promises) {
        var countDown = 0;
        var deferred = defer();
        array_reduce(promises, function (undefined, promise, index) {
            var snapshot;
            if (
                isPromise(promise) &&
                (snapshot = promise.inspect()).state === "fulfilled"
            ) {
                promises[index] = snapshot.value;
            } else {
                ++countDown;
                when(
                    promise,
                    function (value) {
                        promises[index] = value;
                        if (--countDown === 0) {
                            deferred.resolve(promises);
                        }
                    },
                    deferred.reject,
                    function (progress) {
                        deferred.notify({ index: index, value: progress });
                    }
                );
            }
        }, void 0);
        if (countDown === 0) {
            deferred.resolve(promises);
        }
        return deferred.promise;
    });
}

Promise.prototype.all = function () {
    return all(this);
};

/**
 * Waits for all promises to be settled, either fulfilled or
 * rejected.  This is distinct from `all` since that would stop
 * waiting at the first rejection.  The promise returned by
 * `allResolved` will never be rejected.
 * @param promises a promise for an array (or an array) of promises
 * (or values)
 * @return a promise for an array of promises
 */
Q.allResolved = deprecate(allResolved, "allResolved", "allSettled");
function allResolved(promises) {
    return when(promises, function (promises) {
        promises = array_map(promises, Q);
        return when(all(array_map(promises, function (promise) {
            return when(promise, noop, noop);
        })), function () {
            return promises;
        });
    });
}

Promise.prototype.allResolved = function () {
    return allResolved(this);
};

/**
 * @see Promise#allSettled
 */
Q.allSettled = allSettled;
function allSettled(promises) {
    return Q(promises).allSettled();
}

/**
 * Turns an array of promises into a promise for an array of their states (as
 * returned by `inspect`) when they have all settled.
 * @param {Array[Any*]} values an array (or promise for an array) of values (or
 * promises for values)
 * @returns {Array[State]} an array of states for the respective values.
 */
Promise.prototype.allSettled = function () {
    return this.then(function (promises) {
        return all(array_map(promises, function (promise) {
            promise = Q(promise);
            function regardless() {
                return promise.inspect();
            }
            return promise.then(regardless, regardless);
        }));
    });
};

/**
 * Captures the failure of a promise, giving an oportunity to recover
 * with a callback.  If the given promise is fulfilled, the returned
 * promise is fulfilled.
 * @param {Any*} promise for something
 * @param {Function} callback to fulfill the returned promise if the
 * given promise is rejected
 * @returns a promise for the return value of the callback
 */
Q.fail = // XXX legacy
Q["catch"] = function (object, rejected) {
    return Q(object).then(void 0, rejected);
};

Promise.prototype.fail = // XXX legacy
Promise.prototype["catch"] = function (rejected) {
    return this.then(void 0, rejected);
};

/**
 * Attaches a listener that can respond to progress notifications from a
 * promise's originating deferred. This listener receives the exact arguments
 * passed to ``deferred.notify``.
 * @param {Any*} promise for something
 * @param {Function} callback to receive any progress notifications
 * @returns the given promise, unchanged
 */
Q.progress = progress;
function progress(object, progressed) {
    return Q(object).then(void 0, void 0, progressed);
}

Promise.prototype.progress = function (progressed) {
    return this.then(void 0, void 0, progressed);
};

/**
 * Provides an opportunity to observe the settling of a promise,
 * regardless of whether the promise is fulfilled or rejected.  Forwards
 * the resolution to the returned promise when the callback is done.
 * The callback can return a promise to defer completion.
 * @param {Any*} promise
 * @param {Function} callback to observe the resolution of the given
 * promise, takes no arguments.
 * @returns a promise for the resolution of the given promise when
 * ``fin`` is done.
 */
Q.fin = // XXX legacy
Q["finally"] = function (object, callback) {
    return Q(object)["finally"](callback);
};

Promise.prototype.fin = // XXX legacy
Promise.prototype["finally"] = function (callback) {
    callback = Q(callback);
    return this.then(function (value) {
        return callback.fcall().then(function () {
            return value;
        });
    }, function (reason) {
        // TODO attempt to recycle the rejection with "this".
        return callback.fcall().then(function () {
            throw reason;
        });
    });
};

/**
 * Terminates a chain of promises, forcing rejections to be
 * thrown as exceptions.
 * @param {Any*} promise at the end of a chain of promises
 * @returns nothing
 */
Q.done = function (object, fulfilled, rejected, progress) {
    return Q(object).done(fulfilled, rejected, progress);
};

Promise.prototype.done = function (fulfilled, rejected, progress) {
    var onUnhandledError = function (error) {
        // forward to a future turn so that ``when``
        // does not catch it and turn it into a rejection.
        nextTick(function () {
            makeStackTraceLong(error, promise);
            if (Q.onerror) {
                Q.onerror(error);
            } else {
                throw error;
            }
        });
    };

    // Avoid unnecessary `nextTick`ing via an unnecessary `when`.
    var promise = fulfilled || rejected || progress ?
        this.then(fulfilled, rejected, progress) :
        this;

    if (typeof process === "object" && process && process.domain) {
        onUnhandledError = process.domain.bind(onUnhandledError);
    }

    promise.then(void 0, onUnhandledError);
};

/**
 * Causes a promise to be rejected if it does not get fulfilled before
 * some milliseconds time out.
 * @param {Any*} promise
 * @param {Number} milliseconds timeout
 * @param {String} custom error message (optional)
 * @returns a promise for the resolution of the given promise if it is
 * fulfilled before the timeout, otherwise rejected.
 */
Q.timeout = function (object, ms, message) {
    return Q(object).timeout(ms, message);
};

Promise.prototype.timeout = function (ms, message) {
    var deferred = defer();
    var timeoutId = setTimeout(function () {
        deferred.reject(new Error(message || "Timed out after " + ms + " ms"));
    }, ms);

    this.then(function (value) {
        clearTimeout(timeoutId);
        deferred.resolve(value);
    }, function (exception) {
        clearTimeout(timeoutId);
        deferred.reject(exception);
    }, deferred.notify);

    return deferred.promise;
};

/**
 * Returns a promise for the given value (or promised value), some
 * milliseconds after it resolved. Passes rejections immediately.
 * @param {Any*} promise
 * @param {Number} milliseconds
 * @returns a promise for the resolution of the given promise after milliseconds
 * time has elapsed since the resolution of the given promise.
 * If the given promise rejects, that is passed immediately.
 */
Q.delay = function (object, timeout) {
    if (timeout === void 0) {
        timeout = object;
        object = void 0;
    }
    return Q(object).delay(timeout);
};

Promise.prototype.delay = function (timeout) {
    return this.then(function (value) {
        var deferred = defer();
        setTimeout(function () {
            deferred.resolve(value);
        }, timeout);
        return deferred.promise;
    });
};

/**
 * Passes a continuation to a Node function, which is called with the given
 * arguments provided as an array, and returns a promise.
 *
 *      Q.nfapply(FS.readFile, [__filename])
 *      .then(function (content) {
 *      })
 *
 */
Q.nfapply = function (callback, args) {
    return Q(callback).nfapply(args);
};

Promise.prototype.nfapply = function (args) {
    var deferred = defer();
    var nodeArgs = array_slice(args);
    nodeArgs.push(deferred.makeNodeResolver());
    this.fapply(nodeArgs).fail(deferred.reject);
    return deferred.promise;
};

/**
 * Passes a continuation to a Node function, which is called with the given
 * arguments provided individually, and returns a promise.
 * @example
 * Q.nfcall(FS.readFile, __filename)
 * .then(function (content) {
 * })
 *
 */
Q.nfcall = function (callback /*...args*/) {
    var args = array_slice(arguments, 1);
    return Q(callback).nfapply(args);
};

Promise.prototype.nfcall = function (/*...args*/) {
    var nodeArgs = array_slice(arguments);
    var deferred = defer();
    nodeArgs.push(deferred.makeNodeResolver());
    this.fapply(nodeArgs).fail(deferred.reject);
    return deferred.promise;
};

/**
 * Wraps a NodeJS continuation passing function and returns an equivalent
 * version that returns a promise.
 * @example
 * Q.nfbind(FS.readFile, __filename)("utf-8")
 * .then(console.log)
 * .done()
 */
Q.nfbind =
Q.denodeify = function (callback /*...args*/) {
    var baseArgs = array_slice(arguments, 1);
    return function () {
        var nodeArgs = baseArgs.concat(array_slice(arguments));
        var deferred = defer();
        nodeArgs.push(deferred.makeNodeResolver());
        Q(callback).fapply(nodeArgs).fail(deferred.reject);
        return deferred.promise;
    };
};

Promise.prototype.nfbind =
Promise.prototype.denodeify = function (/*...args*/) {
    var args = array_slice(arguments);
    args.unshift(this);
    return Q.denodeify.apply(void 0, args);
};

Q.nbind = function (callback, thisp /*...args*/) {
    var baseArgs = array_slice(arguments, 2);
    return function () {
        var nodeArgs = baseArgs.concat(array_slice(arguments));
        var deferred = defer();
        nodeArgs.push(deferred.makeNodeResolver());
        function bound() {
            return callback.apply(thisp, arguments);
        }
        Q(bound).fapply(nodeArgs).fail(deferred.reject);
        return deferred.promise;
    };
};

Promise.prototype.nbind = function (/*thisp, ...args*/) {
    var args = array_slice(arguments, 0);
    args.unshift(this);
    return Q.nbind.apply(void 0, args);
};

/**
 * Calls a method of a Node-style object that accepts a Node-style
 * callback with a given array of arguments, plus a provided callback.
 * @param object an object that has the named method
 * @param {String} name name of the method of object
 * @param {Array} args arguments to pass to the method; the callback
 * will be provided by Q and appended to these arguments.
 * @returns a promise for the value or error
 */
Q.nmapply = // XXX As proposed by "Redsandro"
Q.npost = function (object, name, args) {
    return Q(object).npost(name, args);
};

Promise.prototype.nmapply = // XXX As proposed by "Redsandro"
Promise.prototype.npost = function (name, args) {
    var nodeArgs = array_slice(args || []);
    var deferred = defer();
    nodeArgs.push(deferred.makeNodeResolver());
    this.dispatch("post", [name, nodeArgs]).fail(deferred.reject);
    return deferred.promise;
};

/**
 * Calls a method of a Node-style object that accepts a Node-style
 * callback, forwarding the given variadic arguments, plus a provided
 * callback argument.
 * @param object an object that has the named method
 * @param {String} name name of the method of object
 * @param ...args arguments to pass to the method; the callback will
 * be provided by Q and appended to these arguments.
 * @returns a promise for the value or error
 */
Q.nsend = // XXX Based on Mark Miller's proposed "send"
Q.nmcall = // XXX Based on "Redsandro's" proposal
Q.ninvoke = function (object, name /*...args*/) {
    var nodeArgs = array_slice(arguments, 2);
    var deferred = defer();
    nodeArgs.push(deferred.makeNodeResolver());
    Q(object).dispatch("post", [name, nodeArgs]).fail(deferred.reject);
    return deferred.promise;
};

Promise.prototype.nsend = // XXX Based on Mark Miller's proposed "send"
Promise.prototype.nmcall = // XXX Based on "Redsandro's" proposal
Promise.prototype.ninvoke = function (name /*...args*/) {
    var nodeArgs = array_slice(arguments, 1);
    var deferred = defer();
    nodeArgs.push(deferred.makeNodeResolver());
    this.dispatch("post", [name, nodeArgs]).fail(deferred.reject);
    return deferred.promise;
};

/**
 * If a function would like to support both Node continuation-passing-style and
 * promise-returning-style, it can end its internal promise chain with
 * `nodeify(nodeback)`, forwarding the optional nodeback argument.  If the user
 * elects to use a nodeback, the result will be sent there.  If they do not
 * pass a nodeback, they will receive the result promise.
 * @param object a result (or a promise for a result)
 * @param {Function} nodeback a Node.js-style callback
 * @returns either the promise or nothing
 */
Q.nodeify = nodeify;
function nodeify(object, nodeback) {
    return Q(object).nodeify(nodeback);
}

Promise.prototype.nodeify = function (nodeback) {
    if (nodeback) {
        this.then(function (value) {
            nextTick(function () {
                nodeback(null, value);
            });
        }, function (error) {
            nextTick(function () {
                nodeback(error);
            });
        });
    } else {
        return this;
    }
};

// All code before this point will be filtered from stack traces.
var qEndingLine = captureLine();

return Q;

});

define('app/api',["q"], function(Q) {

    

    Q.stopUnhandledRejectionTracking();
    Q.longStackSupport = true;

    var salt = "Eech7co8Ohloopo9Ol6baimi",
        location = window.location.pathname;

    var rules = {
        "/": [200, 404],
        "/new": [201, 202],
        "/id/\\d+": [200, 403, 404],
        "/id/\\d+/(like/dislike)": [200],
        "/count": [200]
    };

    /*
     * Detect Isso API endpoint. There are typically two use cases:
     *
     *   1. use minified, single-file JavaScript. The browser interprets
     *      scripts sequentially, thus we can safely use the last script
     *      tag. Then, we chop off some characters -- /js/embed.min.s --
     *      and we're done.
     *
     *      If the script is not served by Isso directly, a custom data
     *      attribute can be used to override the default detection
     *      mechanism:
     *
     *      .. code-block:: html
     *
     *          <script data-isso="http://example.tld/path/" src="/.../embed.min.js"></script>
     */

    var script, endpoint,
        js = document.getElementsByTagName("script");

    for (var i = 0; i < js.length; i++) {
        if (js[i].hasAttribute("data-isso")) {
            endpoint = js[i].getAttribute("data-isso");
            break;
        }
    }

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

    var curl = function(method, url, data) {

        var xhr = new XMLHttpRequest();
        var response = Q.defer();

        function onload() {

            var rule = url.replace(endpoint, "").split("?", 1)[0];
            var cookie = xhr.getResponseHeader("X-Set-Cookie");

            if (cookie && cookie.match(/^isso-/)) {
                document.cookie = cookie;
            }

            if (rule in rules && rules[rule].indexOf(xhr.status) === -1) {
                response.reject(xhr.responseText);
            } else {
                response.resolve({status: xhr.status, body: xhr.responseText});
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
            response.reject(exception.message);
        }

        xhr.send(data);
        return response.promise;
    };

    var qs = function(params) {
        var rv = "";
        for (var key in params) {
            if (params.hasOwnProperty(key) && params[key]) {
                rv += key + "=" + encodeURIComponent(params[key]) + "&";
            }
        }

        return rv.substring(0, rv.length - 1);  // chop off trailing "&"
    };

    var create = function(tid, data) {
        return curl("POST", endpoint + "/new?" + qs({uri: tid || location}), JSON.stringify(data)).then(
            function (rv) { return JSON.parse(rv.body); });
    };

    var modify = function(id, data) {
        return curl("PUT", endpoint + "/id/" + id, JSON.stringify(data)).then(
            function (rv) { return JSON.parse(rv.body); });
    };

    var remove = function(id) {
        return curl("DELETE", endpoint + "/id/" + id, null).then(function(rv) {
            if (rv.status === 403) {
                throw "Not authorized to remove this comment!";
            }

            return JSON.parse(rv.body) === null;
        });
    };

    var view = function(id, plain) {
        return curl("GET", endpoint + "/id/" + id + "?" + qs({plain: plain}), null).then(function (rv) {
            return JSON.parse(rv.body);
        });
    };

    var fetch = function(tid) {

        return curl("GET", endpoint + "/?" + qs({uri: tid || location}), null).then(function (rv) {
            if (rv.status === 200) {
                return JSON.parse(rv.body);
            } else {
                return [];
            }
        });
    };

    var count = function(tid) {
        return curl("GET", endpoint + "/count?" + qs({uri: tid || location}), null).then(function(rv) {
            return JSON.parse(rv.body);
        });
    };

    var like = function(id) {
        return curl("POST", endpoint + "/id/" + id + "/like", null).then(function(rv) {
            return JSON.parse(rv.body);
        });
    };

    var dislike = function(id) {
        return curl("POST", endpoint + "/id/" + id + "/dislike", null).then(function(rv) {
            return JSON.parse(rv.body);
        });
    };

    var remote_addr = function() {
        return curl("GET", endpoint + "/check-ip", null).then(function(rv) {
                return rv.body;
        });
    };

    return {
        endpoint: endpoint,
        salt: salt,

        remote_addr: remote_addr,

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

/**
 * @license RequireJS text 2.0.10 Copyright (c) 2010-2012, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/requirejs/text for details
 */
/*jslint regexp: true */
/*global require, XMLHttpRequest, ActiveXObject,
  define, window, process, Packages,
  java, location, Components, FileUtils */

define('text',['module'], function (module) {
    

    var text, fs, Cc, Ci, xpcIsWindows,
        progIds = ['Msxml2.XMLHTTP', 'Microsoft.XMLHTTP', 'Msxml2.XMLHTTP.4.0'],
        xmlRegExp = /^\s*<\?xml(\s)+version=[\'\"](\d)*.(\d)*[\'\"](\s)*\?>/im,
        bodyRegExp = /<body[^>]*>\s*([\s\S]+)\s*<\/body>/im,
        hasLocation = typeof location !== 'undefined' && location.href,
        defaultProtocol = hasLocation && location.protocol && location.protocol.replace(/\:/, ''),
        defaultHostName = hasLocation && location.hostname,
        defaultPort = hasLocation && (location.port || undefined),
        buildMap = {},
        masterConfig = (module.config && module.config()) || {};

    text = {
        version: '2.0.10',

        strip: function (content) {
            //Strips <?xml ...?> declarations so that external SVG and XML
            //documents can be added to a document without worry. Also, if the string
            //is an HTML document, only the part inside the body tag is returned.
            if (content) {
                content = content.replace(xmlRegExp, "");
                var matches = content.match(bodyRegExp);
                if (matches) {
                    content = matches[1];
                }
            } else {
                content = "";
            }
            return content;
        },

        jsEscape: function (content) {
            return content.replace(/(['\\])/g, '\\$1')
                .replace(/[\f]/g, "\\f")
                .replace(/[\b]/g, "\\b")
                .replace(/[\n]/g, "\\n")
                .replace(/[\t]/g, "\\t")
                .replace(/[\r]/g, "\\r")
                .replace(/[\u2028]/g, "\\u2028")
                .replace(/[\u2029]/g, "\\u2029");
        },

        createXhr: masterConfig.createXhr || function () {
            //Would love to dump the ActiveX crap in here. Need IE 6 to die first.
            var xhr, i, progId;
            if (typeof XMLHttpRequest !== "undefined") {
                return new XMLHttpRequest();
            } else if (typeof ActiveXObject !== "undefined") {
                for (i = 0; i < 3; i += 1) {
                    progId = progIds[i];
                    try {
                        xhr = new ActiveXObject(progId);
                    } catch (e) {}

                    if (xhr) {
                        progIds = [progId];  // so faster next time
                        break;
                    }
                }
            }

            return xhr;
        },

        /**
         * Parses a resource name into its component parts. Resource names
         * look like: module/name.ext!strip, where the !strip part is
         * optional.
         * @param {String} name the resource name
         * @returns {Object} with properties "moduleName", "ext" and "strip"
         * where strip is a boolean.
         */
        parseName: function (name) {
            var modName, ext, temp,
                strip = false,
                index = name.indexOf("."),
                isRelative = name.indexOf('./') === 0 ||
                             name.indexOf('../') === 0;

            if (index !== -1 && (!isRelative || index > 1)) {
                modName = name.substring(0, index);
                ext = name.substring(index + 1, name.length);
            } else {
                modName = name;
            }

            temp = ext || modName;
            index = temp.indexOf("!");
            if (index !== -1) {
                //Pull off the strip arg.
                strip = temp.substring(index + 1) === "strip";
                temp = temp.substring(0, index);
                if (ext) {
                    ext = temp;
                } else {
                    modName = temp;
                }
            }

            return {
                moduleName: modName,
                ext: ext,
                strip: strip
            };
        },

        xdRegExp: /^((\w+)\:)?\/\/([^\/\\]+)/,

        /**
         * Is an URL on another domain. Only works for browser use, returns
         * false in non-browser environments. Only used to know if an
         * optimized .js version of a text resource should be loaded
         * instead.
         * @param {String} url
         * @returns Boolean
         */
        useXhr: function (url, protocol, hostname, port) {
            var uProtocol, uHostName, uPort,
                match = text.xdRegExp.exec(url);
            if (!match) {
                return true;
            }
            uProtocol = match[2];
            uHostName = match[3];

            uHostName = uHostName.split(':');
            uPort = uHostName[1];
            uHostName = uHostName[0];

            return (!uProtocol || uProtocol === protocol) &&
                   (!uHostName || uHostName.toLowerCase() === hostname.toLowerCase()) &&
                   ((!uPort && !uHostName) || uPort === port);
        },

        finishLoad: function (name, strip, content, onLoad) {
            content = strip ? text.strip(content) : content;
            if (masterConfig.isBuild) {
                buildMap[name] = content;
            }
            onLoad(content);
        },

        load: function (name, req, onLoad, config) {
            //Name has format: some.module.filext!strip
            //The strip part is optional.
            //if strip is present, then that means only get the string contents
            //inside a body tag in an HTML string. For XML/SVG content it means
            //removing the <?xml ...?> declarations so the content can be inserted
            //into the current doc without problems.

            // Do not bother with the work if a build and text will
            // not be inlined.
            if (config.isBuild && !config.inlineText) {
                onLoad();
                return;
            }

            masterConfig.isBuild = config.isBuild;

            var parsed = text.parseName(name),
                nonStripName = parsed.moduleName +
                    (parsed.ext ? '.' + parsed.ext : ''),
                url = req.toUrl(nonStripName),
                useXhr = (masterConfig.useXhr) ||
                         text.useXhr;

            // Do not load if it is an empty: url
            if (url.indexOf('empty:') === 0) {
                onLoad();
                return;
            }

            //Load the text. Use XHR if possible and in a browser.
            if (!hasLocation || useXhr(url, defaultProtocol, defaultHostName, defaultPort)) {
                text.get(url, function (content) {
                    text.finishLoad(name, parsed.strip, content, onLoad);
                }, function (err) {
                    if (onLoad.error) {
                        onLoad.error(err);
                    }
                });
            } else {
                //Need to fetch the resource across domains. Assume
                //the resource has been optimized into a JS module. Fetch
                //by the module name + extension, but do not include the
                //!strip part to avoid file system issues.
                req([nonStripName], function (content) {
                    text.finishLoad(parsed.moduleName + '.' + parsed.ext,
                                    parsed.strip, content, onLoad);
                });
            }
        },

        write: function (pluginName, moduleName, write, config) {
            if (buildMap.hasOwnProperty(moduleName)) {
                var content = text.jsEscape(buildMap[moduleName]);
                write.asModule(pluginName + "!" + moduleName,
                               "define(function () { return '" +
                                   content +
                               "';});\n");
            }
        },

        writeFile: function (pluginName, moduleName, req, write, config) {
            var parsed = text.parseName(moduleName),
                extPart = parsed.ext ? '.' + parsed.ext : '',
                nonStripName = parsed.moduleName + extPart,
                //Use a '.js' file name so that it indicates it is a
                //script that can be loaded across domains.
                fileName = req.toUrl(parsed.moduleName + extPart) + '.js';

            //Leverage own load() method to load plugin value, but only
            //write out values that do not have the strip argument,
            //to avoid any potential issues with ! in file names.
            text.load(nonStripName, req, function (value) {
                //Use own write() method to construct full module value.
                //But need to create shell that translates writeFile's
                //write() to the right interface.
                var textWrite = function (contents) {
                    return write(fileName, contents);
                };
                textWrite.asModule = function (moduleName, contents) {
                    return write.asModule(moduleName, fileName, contents);
                };

                text.write(pluginName, nonStripName, textWrite, config);
            }, config);
        }
    };

    if (masterConfig.env === 'node' || (!masterConfig.env &&
            typeof process !== "undefined" &&
            process.versions &&
            !!process.versions.node &&
            !process.versions['node-webkit'])) {
        //Using special require.nodeRequire, something added by r.js.
        fs = require.nodeRequire('fs');

        text.get = function (url, callback, errback) {
            try {
                var file = fs.readFileSync(url, 'utf8');
                //Remove BOM (Byte Mark Order) from utf8 files if it is there.
                if (file.indexOf('\uFEFF') === 0) {
                    file = file.substring(1);
                }
                callback(file);
            } catch (e) {
                errback(e);
            }
        };
    } else if (masterConfig.env === 'xhr' || (!masterConfig.env &&
            text.createXhr())) {
        text.get = function (url, callback, errback, headers) {
            var xhr = text.createXhr(), header;
            xhr.open('GET', url, true);

            //Allow plugins direct access to xhr headers
            if (headers) {
                for (header in headers) {
                    if (headers.hasOwnProperty(header)) {
                        xhr.setRequestHeader(header.toLowerCase(), headers[header]);
                    }
                }
            }

            //Allow overrides specified in config
            if (masterConfig.onXhr) {
                masterConfig.onXhr(xhr, url);
            }

            xhr.onreadystatechange = function (evt) {
                var status, err;
                //Do not explicitly handle errors, those should be
                //visible via console output in the browser.
                if (xhr.readyState === 4) {
                    status = xhr.status;
                    if (status > 399 && status < 600) {
                        //An http 4xx or 5xx error. Signal an error.
                        err = new Error(url + ' HTTP status: ' + status);
                        err.xhr = xhr;
                        errback(err);
                    } else {
                        callback(xhr.responseText);
                    }

                    if (masterConfig.onXhrComplete) {
                        masterConfig.onXhrComplete(xhr, url);
                    }
                }
            };
            xhr.send(null);
        };
    } else if (masterConfig.env === 'rhino' || (!masterConfig.env &&
            typeof Packages !== 'undefined' && typeof java !== 'undefined')) {
        //Why Java, why is this so awkward?
        text.get = function (url, callback) {
            var stringBuffer, line,
                encoding = "utf-8",
                file = new java.io.File(url),
                lineSeparator = java.lang.System.getProperty("line.separator"),
                input = new java.io.BufferedReader(new java.io.InputStreamReader(new java.io.FileInputStream(file), encoding)),
                content = '';
            try {
                stringBuffer = new java.lang.StringBuffer();
                line = input.readLine();

                // Byte Order Mark (BOM) - The Unicode Standard, version 3.0, page 324
                // http://www.unicode.org/faq/utf_bom.html

                // Note that when we use utf-8, the BOM should appear as "EF BB BF", but it doesn't due to this bug in the JDK:
                // http://bugs.sun.com/bugdatabase/view_bug.do?bug_id=4508058
                if (line && line.length() && line.charAt(0) === 0xfeff) {
                    // Eat the BOM, since we've already found the encoding on this file,
                    // and we plan to concatenating this buffer with others; the BOM should
                    // only appear at the top of a file.
                    line = line.substring(1);
                }

                if (line !== null) {
                    stringBuffer.append(line);
                }

                while ((line = input.readLine()) !== null) {
                    stringBuffer.append(lineSeparator);
                    stringBuffer.append(line);
                }
                //Make sure we return a JavaScript string and not a Java string.
                content = String(stringBuffer.toString()); //String
            } finally {
                input.close();
            }
            callback(content);
        };
    } else if (masterConfig.env === 'xpconnect' || (!masterConfig.env &&
            typeof Components !== 'undefined' && Components.classes &&
            Components.interfaces)) {
        //Avert your gaze!
        Cc = Components.classes,
        Ci = Components.interfaces;
        Components.utils['import']('resource://gre/modules/FileUtils.jsm');
        xpcIsWindows = ('@mozilla.org/windows-registry-key;1' in Cc);

        text.get = function (url, callback) {
            var inStream, convertStream, fileObj,
                readData = {};

            if (xpcIsWindows) {
                url = url.replace(/\//g, '\\');
            }

            fileObj = new FileUtils.File(url);

            //XPCOM, you so crazy
            try {
                inStream = Cc['@mozilla.org/network/file-input-stream;1']
                           .createInstance(Ci.nsIFileInputStream);
                inStream.init(fileObj, 1, 0, false);

                convertStream = Cc['@mozilla.org/intl/converter-input-stream;1']
                                .createInstance(Ci.nsIConverterInputStream);
                convertStream.init(inStream, "utf-8", inStream.available(),
                Ci.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER);

                convertStream.readString(inStream.available(), readData);
                convertStream.close();
                inStream.close();
                callback(readData.value);
            } catch (e) {
                throw new Error((fileObj && fileObj.path || '') + ': ' + e);
            }
        };
    }
    return text;
});

define('text!app/text/postbox.html',[],function () { return '<div class="postbox">\n    <div class="avatar">\n        <svg class="blank" data-hash="{{ hash }}"></svg>\n    </div>\n    <div class="form-wrapper">\n        <div class="textarea-wrapper">\n            <textarea name="text" rows="2" placeholder="{{ i18n-postbox-text }}"></textarea>\n        </div>\n        <section class="auth-section">\n            <p class="input-wrapper">\n                <input type="text" name="author" placeholder="{{ i18n-postbox-author }}"/>\n            </p>\n            <p class="input-wrapper">\n                <input type="email" name="email" placeholder="{{ i18n-postbox-email }}"/>\n            </p>\n            <p class="post-action">\n                <input type="submit" value="{{ i18n-postbox-submit }}"/>\n            </p>\n        </section>\n    </div>\n</div>';});

define('text!app/text/comment.html',[],function () { return '<div class="isso-comment" id="isso-{{ id | blank }}">\n    <div class="avatar">\n        <svg data-hash="{{ hash }}"></svg>\n    </div>\n    <div class="text-wrapper">\n        <div class="isso-comment-header" role="meta">\n            {{ if bool(website) }}\n            <a class="author" href="{{ website }}" rel="nofollow">\n                {{ author | blank : `i18n-comment-anonymous` }}\n            </a>\n            {{ else }}\n                <span class="author">\n                    {{ author | blank : `i18n-comment-anonymous` }}\n                </span>\n            {{ /if }}\n\n            {{ if parent }}\n            <span class="spacer">•</span>\n            <a class="parent" href="#isso-{{ parent }}">\n                <i>{{ svg-forward }}</i>{{ replyto | blank: `i18n-comment-anonymous` }}\n            </a>\n            {{ /if }}\n\n            <span class="spacer">•</span>\n\n            <a class="permalink" href="#isso-{{ id }}">\n                <date datetime="{{ created | datetime }}"></date>\n            </a>\n\n            <span class="note">\n            {{ if mode | equals : 2 }}\n                {{ i18n-comment-queued }}\n            {{ /if }}\n            {{ if mode | equals : 4 }}\n                {{ i18n-comment-deleted }}\n            {{ /if }}\n            </span>\n\n        </div>\n        <div class="text">\n            {{ if mode | equals : 4 }}\n                <p>&nbsp;</p>\n            {{ else }}\n                {{ text }}\n            {{ /if }}\n        </div>\n        <div class="isso-comment-footer">\n            {{ if likes | substract : `dislikes` | notequals : 0 }}\n                <span class="votes">{{ likes | substract : `dislikes` }}</span>\n            {{ /if }}\n            <a class="upvote" href="#"><i>{{ svg-arrow-up}}</i></a>\n            <span class="spacer">|</span>\n            <a class="downvote" href="#"><i>{{ svg-arrow-down}}</i></a>\n\n            <a class="reply" href="#">{{ i18n-comment-reply }}</a>\n            <a class="edit" href="#">{{ i18n-comment-edit }}</a>\n            <a class="delete" href="#">{{ i18n-comment-delete }}</a>\n        </div>\n        <div class="isso-follow-up">\n        </div>\n    </div>\n</div>';});

define('app/text/html',["text!./postbox.html", "text!./comment.html"], function (postbox, comment) {
    return {
        postbox: postbox,
        comment: comment
    };
});

define('app/dom',[],function() {

    

    window.Element.prototype.replace = function(el) {
        var element = DOM.htmlify(el);
        this.parentNode.replaceChild(element, this);
        return element;
    };

    window.Element.prototype.prepend = function(el) {
        var element = DOM.htmlify(el);
        this.insertBefore(element, this.firstChild);
        return element;
    };

    window.Element.prototype.append = function(el) {
        var element = DOM.htmlify(el);
        this.appendChild(element);
        return element;
    };

    window.Element.prototype.insertAfter = function(el) {
        var element = DOM.htmlify(el);
        this.parentNode.insertBefore(element, this.nextSibling);
        return element;
    };

    window.Element.prototype.on = function(type, listener, prevent) {
        /*
        Shortcut for `Element.addEventListener`, prevents default event
        by default, set :param prevents: to `false` to change that behavior.
         */
        this.addEventListener(type, function(event) {
            listener();
            if (prevent === undefined || prevent) {
                event.preventDefault();
            }
        });
    };

    window.Element.prototype.toggle = function(type, on, off) {
        /*
        Toggle between two internal states on event :param type: e.g. to
        cycle form visibility. Callback :param on: is called on first event,
        :param off: next time.

        You can skip to the next state without executing the callback with
        `toggler.next()`. You can prevent a cycle when you call `toggler.wait()`
        during an event.
         */

        function Toggle(el, on, off) {
            this.state = false;
            this.el = el;
            this.on = on;
            this.off = off;
        }

        Toggle.prototype.next = function next() {
            if (! this.state) {
                this.state = true;
                this.on(this);
            } else {
                this.state = false;
                this.off(this);
            }
        };

        Toggle.prototype.wait = function wait() {
            this.state = ! this.state;
        };

        var toggler = new Toggle(this, on, off);
        this.on(type, function() {
            toggler.next();
        });
    };

    window.Element.prototype.detach = function() {
        /*
        Detach an element from the DOM and return it.
         */

        this.parentNode.removeChild(this);
        return this;
    };

    window.Element.prototype.remove = function() {
        // Mimimi, I am IE and I am so retarded, mimimi.
        this.parentNode.removeChild(this);
    };

    var DOM = function(query, root) {
        /*
        jQuery-like CSS selector which returns on :param query: either a
        single node, a node list or null.

        :param root: only queries within the given element.
         */

        if (! root) {
            root = window.document;
        }

        var elements = root.querySelectorAll(query);

        if (elements.length === 0) {
            return null;
        }

        if (elements.length === 1) {
            return elements[0];
        }

        return elements;
    };

    DOM.htmlify = function(html) {
        /*
        Convert :param html: into an Element (if not already).
         */

        if (html instanceof window.Element) {
            return html;
        }

        var wrapper = DOM.new("div");
        wrapper.innerHTML = html;
        return wrapper.firstChild;
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

        if (["TEXTAREA", "INPUT"].indexOf(el.nodeName) > -1) {
            el.value = content || "";
        } else {
            el.textContent = content || "";
        }
        return el;
    };

    DOM.each = function(tag, func) {
        // XXX really needed? Maybe better as NodeList method
        Array.prototype.forEach.call(document.getElementsByTagName(tag), func);
    };

    return DOM;
});
/*
  Markup.js v1.5.16: http://github.com/adammark/Markup.js
  MIT License
  (c) 2011 - 2013 Adam Mark
*/
var Mark = {
    // Templates to include, by name. A template is a string.
    includes: {},

    // Global variables, by name. Global variables take precedence over context variables.
    globals: {},

    // The delimiter to use in pipe expressions, e.g. {{if color|like>red}}.
    delimiter: ">",

    // Collapse white space between HTML elements in the resulting string.
    compact: false,

    // Shallow-copy an object.
    _copy: function (a, b) {
        b = b || [];

        for (var i in a) {
            b[i] = a[i];
        }

        return b;
    },

    // Get the value of a number or size of an array. This is a helper function for several pipes.
    _size: function (a) {
        return a instanceof Array ? a.length : (a || 0);
    },

    // This object represents an iteration. It has an index and length.
    _iter: function (idx, size) {
        this.idx = idx;
        this.size = size;
        this.length = size;
        this.sign = "#";

        // Print the index if "#" or the count if "##".
        this.toString = function () {
            return this.idx + this.sign.length - 1;
        };
    },

    // Pass a value through a series of pipe expressions, e.g. _pipe(123, ["add>10","times>5"]).
    _pipe: function (val, expressions) {
        var expression, parts, fn, result;

        // If we have expressions, pull out the first one, e.g. "add>10".
        if ((expression = expressions.shift())) {

            // Split the expression into its component parts, e.g. ["add", "10"].
            parts = expression.split(this.delimiter);

            // Pull out the function name, e.g. "add".
            fn = parts.shift().trim();

            try {
                // Run the function, e.g. add(123, 10) ...
                result = Mark.pipes[fn].apply(null, [val].concat(parts));

                // ... then pipe again with remaining expressions.
                val = this._pipe(result, expressions);
            }
            catch (e) {
            }
        }

        // Return the piped value.
        return val;
    },

    // TODO doc
    _eval: function (context, filters, child) {
        var result = this._pipe(context, filters),
            ctx = result,
            i = -1,
            j,
            opts;

        if (result instanceof Array) {
            result = "";
            j = ctx.length;

            while (++i < j) {
                opts = {
                    iter: new this._iter(i, j)
                };
                result += child ? Mark.up(child, ctx[i], opts) : ctx[i];
            }
        }
        else if (result instanceof Object) {
            result = Mark.up(child, ctx);
        }

        return result;
    },

    // Process the contents of an IF or IF/ELSE block.
    _test: function (bool, child, context, options) {
        // Process the child string, then split it into the IF and ELSE parts.
        var str = Mark.up(child, context, options).split(/\{\{\s*else\s*\}\}/);

        // Return the IF or ELSE part. If no ELSE, return an empty string.
        return (bool === false ? str[1] : str[0]) || "";
    },

    // Determine the extent of a block expression, e.g. "{{foo}}...{{/foo}}"
    _bridge: function (tpl, tkn) {
        var exp = "{{\\s*" + tkn + "([^/}]+\\w*)?}}|{{/" + tkn + "\\s*}}",
            re = new RegExp(exp, "g"),
            tags = tpl.match(re) || [],
            t,
            i,
            a = 0,
            b = 0,
            c = -1,
            d = 0;

        for (i = 0; i < tags.length; i++) {
            t = i;
            c = tpl.indexOf(tags[t], c + 1);

            if (tags[t].indexOf("{{/") > -1) {
                b++;
            }
            else {
                a++;
            }

            if (a === b) {
                break;
            }
        }

        a = tpl.indexOf(tags[0]);
        b = a + tags[0].length;
        d = c + tags[t].length;

        // Return the block, e.g. "{{foo}}bar{{/foo}}" and its child, e.g. "bar".
        return [tpl.substring(a, d), tpl.substring(b, c)];
    }
};

// Inject a template string with contextual data and return a new string.
Mark.up = function (template, context, options) {
    context = context || {};
    options = options || {};

    // Match all tags like "{{...}}".
    var re = /\{\{(.+?)\}\}/g,
        // All tags in the template.
        tags = template.match(re) || [],
        // The tag being evaluated, e.g. "{{hamster|dance}}".
        tag,
        // The expression to evaluate inside the tag, e.g. "hamster|dance".
        prop,
        // The token itself, e.g. "hamster".
        token,
        // An array of pipe expressions, e.g. ["more>1", "less>2"].
        filters = [],
        // Does the tag close itself? e.g. "{{stuff/}}".
        selfy,
        // Is the tag an "if" statement?
        testy,
        // The contents of a block tag, e.g. "{{aa}}bb{{/aa}}" -> "bb".
        child,
        // The resulting string.
        result,
        // The global variable being evaluated, or undefined.
        global,
        // The included template being evaluated, or undefined.
        include,
        // A placeholder variable.
        ctx,
        // Iterators.
        i = 0,
        j = 0;

    // Set custom pipes, if provided.
    if (options.pipes) {
        this._copy(options.pipes, this.pipes);
    }

    // Set templates to include, if provided.
    if (options.includes) {
        this._copy(options.includes, this.includes);
    }

    // Set global variables, if provided.
    if (options.globals) {
        this._copy(options.globals, this.globals);
    }

    // Optionally override the delimiter.
    if (options.delimiter) {
        this.delimiter = options.delimiter;
    }

    // Optionally collapse white space.
    if (options.compact !== undefined) {
        this.compact = options.compact;
    }

    // Loop through tags, e.g. {{a}}, {{b}}, {{c}}, {{/c}}.
    while ((tag = tags[i++])) {
        result = undefined;
        child = "";
        selfy = tag.indexOf("/}}") > -1;
        prop = tag.substr(2, tag.length - (selfy ? 5 : 4));
        prop = prop.replace(/`(.+?)`/g, function (s, p1) {
            return Mark.up("{{" + p1 + "}}", context);
        });
        testy = prop.trim().indexOf("if ") === 0;
        filters = prop.split("|");
        filters.shift(); // instead of splice(1)
        prop = prop.replace(/^\s*if/, "").split("|").shift().trim();
        token = testy ? "if" : prop.split("|")[0];
        ctx = context[prop];

        // If an "if" statement without filters, assume "{{if foo|notempty}}"
        if (testy && !filters.length) {
            filters = ["notempty"];
        }

        // Does the tag have a corresponding closing tag? If so, find it and move the cursor.
        if (!selfy && template.indexOf("{{/" + token) > -1) {
            result = this._bridge(template, token);
            tag = result[0];
            child = result[1];
            i += tag.match(re).length - 1; // fast forward
        }

        // Skip "else" tags. These are pulled out in _test().
        if (/^\{\{\s*else\s*\}\}$/.test(tag)) {
            continue;
        }

        // Evaluating a global variable.
        else if ((global = this.globals[prop]) !== undefined) {
            result = this._eval(global, filters, child);
        }

        // Evaluating an included template.
        else if ((include = this.includes[prop])) {
            if (include instanceof Function) {
                include = include();
            }
            result = this._pipe(Mark.up(include, context), filters);
        }

        // Evaluating a loop counter ("#" or "##").
        else if (prop.indexOf("#") > -1) {
            options.iter.sign = prop;
            result = this._pipe(options.iter, filters);
        }

        // Evaluating the current context.
        else if (prop === ".") {
            result = this._pipe(context, filters);
        }

        // Evaluating a variable with dot notation, e.g. "a.b.c"
        else if (prop.indexOf(".") > -1) {
            prop = prop.split(".");
            ctx = Mark.globals[prop[0]];

            if (ctx) {
                j = 1;
            }
            else {
                j = 0;
                ctx = context;
            }

            // Get the actual context
            while (ctx && j < prop.length) {
                ctx = ctx[prop[j++]];
            }

            result = this._eval(ctx, filters, child);
        }

        // Evaluating an "if" statement.
        else if (testy) {
            result = this._pipe(ctx, filters);
        }

        // Evaluating an array, which might be a block expression.
        else if (ctx instanceof Array) {
            result = this._eval(ctx, filters, child);
        }

        // Evaluating a block expression.
        else if (child) {
            result = ctx ? Mark.up(child, ctx) : undefined;
        }

        // Evaluating anything else.
        else if (context.hasOwnProperty(prop)) {
            result = this._pipe(ctx, filters);
        }

        // Evaluating an "if" statement.
        if (testy) {
            result = this._test(result, child, context, options);
        }

        // Replace the tag, e.g. "{{name}}", with the result, e.g. "Adam".
        template = template.replace(tag, result === undefined ? "???" : result);
    }

    return this.compact ? template.replace(/>\s+</g, "><") : template;
};

// Freebie pipes. See usage in README.md
Mark.pipes = {
    empty: function (obj) {
        return !obj || (obj + "").trim().length === 0 ? obj : false;
    },
    notempty: function (obj) {
        return obj && (obj + "").trim().length ? obj : false;
    },
    blank: function (str, val) {
        return !!str || str === 0 ? str : val;
    },
    more: function (a, b) {
        return Mark._size(a) > b ? a : false;
    },
    less: function (a, b) {
        return Mark._size(a) < b ? a : false;
    },
    ormore: function (a, b) {
        return Mark._size(a) >= b ? a : false;
    },
    orless: function (a, b) {
        return Mark._size(a) <= b ? a : false;
    },
    between: function (a, b, c) {
        a = Mark._size(a);
        return a >= b && a <= c ? a : false;
    },
    equals: function (a, b) {
        return a == b ? a : false;
    },
    notequals: function (a, b) {
        return a != b ? a : false;
    },
    like: function (str, pattern) {
        return new RegExp(pattern, "i").test(str) ? str : false;
    },
    notlike: function (str, pattern) {
        return !Mark.pipes.like(str, pattern) ? str : false;
    },
    upcase: function (str) {
        return String(str).toUpperCase();
    },
    downcase: function (str) {
        return String(str).toLowerCase();
    },
    capcase: function (str) {
        return str.replace(/\b\w/g, function (s) { return s.toUpperCase(); });
    },
    chop: function (str, n) {
        return str.length > n ? str.substr(0, n) + "..." : str;
    },
    tease: function (str, n) {
        var a = str.split(/\s+/);
        return a.slice(0, n).join(" ") + (a.length > n ? "..." : "");
    },
    trim: function (str) {
        return str.trim();
    },
    pack: function (str) {
        return str.trim().replace(/\s{2,}/g, " ");
    },
    round: function (num) {
        return Math.round(+num);
    },
    clean: function (str) {
        return String(str).replace(/<\/?[^>]+>/gi, "");
    },
    size: function (obj) {
        return obj.length;
    },
    length: function (obj) {
        return obj.length;
    },
    reverse: function (arr) {
        return Mark._copy(arr).reverse();
    },
    join: function (arr, separator) {
        return arr.join(separator);
    },
    limit: function (arr, count, idx) {
        return arr.slice(+idx || 0, +count + (+idx || 0));
    },
    split: function (str, separator) {
        return str.split(separator || ",");
    },
    choose: function (bool, iffy, elsy) {
        return !!bool ? iffy : (elsy || "");
    },
    toggle: function (obj, csv1, csv2, str) {
        return csv2.split(",")[csv1.match(/\w+/g).indexOf(obj + "")] || str;
    },
    sort: function (arr, prop) {
        var fn = function (a, b) {
            return a[prop] > b[prop] ? 1 : -1;
        };
        return Mark._copy(arr).sort(prop ? fn : undefined);
    },
    fix: function (num, n) {
        return (+num).toFixed(n);
    },
    mod: function (num, n) {
        return (+num) % (+n);
    },
    divisible: function (num, n) {
        return num && (+num % n) === 0 ? num : false;
    },
    even: function (num) {
        return num && (+num & 1) === 0 ? num : false;
    },
    odd: function (num) {
        return num && (+num & 1) === 1 ? num : false;
    },
    number: function (str) {
        return parseFloat(str.replace(/[^\-\d\.]/g, ""));
    },
    url: function (str) {
        return encodeURI(str);
    },
    bool: function (obj) {
        return !!obj;
    },
    falsy: function (obj) {
        return !obj;
    },
    first: function (iter) {
        return iter.idx === 0;
    },
    last: function (iter) {
        return iter.idx === iter.size - 1;
    },
    call: function (obj, fn) {
        return obj[fn].apply(obj, [].slice.call(arguments, 2));
    },
    set: function (obj, key) {
        Mark.globals[key] = obj; return "";
    },
    log: function (obj) {
        console.log(obj);
        return obj;
    }
};

// Shim for IE.
if (typeof String.prototype.trim !== "function") {
    String.prototype.trim = function() {
        return this.replace(/^\s+|\s+$/g, ""); 
    }
}

// Export for Node.js and AMD.
if (typeof module !== "undefined" && module.exports) {
    module.exports = Mark;
}
else if (typeof define === "function" && define.amd) {
    define('vendor/markup',[],function() {
        return Mark;
    });
}
;
define('app/i18n/de',{
    "postbox-text" : "Kommentar hier eintippen (mindestens 3 Zeichen)",
    "postbox-author" : "Name (optional)",
    "postbox-email" : "Email (optional)",
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

    "date-now": "right now",
    "date-minute": "a minute ago\n{{ n }} minutes ago",
    "date-hour": "an hour ago\n{{ n }} hours ago",
    "date-day": "Yesterday\n{{ n }} days ago",
    "date-week": "last week\n{{ n }} weeks ago",
    "date-month": "last month\n{{ n }} months ago",
    "date-year": "last year\n{{ n }} years ago"
});
define('app/i18n/fr',{
    "postbox-text": "Insérez votre commentaire ici (au moins 3 lettres)",
    "postbox-author": "Nom (optionel)",
    "postbox-email": "Courriel (optionel)",
    "postbox-submit": "Soumettre",

    "num-comments": "Un commentaire\n{{ n }} commentaires",
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

    "date-now": "À l'instant'",
    "date-minute": "Il y a une minute \n{{ n }} minutes",
    "date-hour": "Il y a une heure\n{{ n }} heures ",
    "date-day": "Hier\n{{ n }} jours auparavant",
    "date-week": "Il y a une semaine\n{{ n }} semaines",
    "date-month": "Il y a un mois\n{{ n }} mois",
    "date-year": "Il y a un an\n{{ n }} ans"
});

define('app/i18n/ru',{
    "postbox-text" : "Комментировать здесь  (миниум 3 символа)",
    "postbox-author" : "Имя (необязательно)",
    "postbox-email" : "Email (необязательно)",
    "postbox-submit": "Отправить",

    "num-comments": "1 Комментарий\n{{ n }} Комментарии",
    "no-comments": "Нет Комментарев",

    "comment-reply": "Ответить",
    "comment-edit": "Правка",
    "comment-save": "Сохранить",
    "comment-delete": "Удалить",
    "comment-confirm": "Подтвердить",
    "comment-close": "Закрыть",
    "comment-cancel": "Отменить",
    "comment-deleted": "Удалить комментарий",
    "comment-queued": "Комментарий должен быть разблокирован",
    "comment-anonymous": "Аномимый",

    "date-now": "Сейчас",
    "date-minute": "Минут назад\n{{ n }} минут",
    "date-hour": "Час назад\n{{ n }} часов",
    "date-day": "Вчера\n{{ n }} дней",
    "date-week": "на прошлой недели\n{{ n }} недель",
    "date-month": "в прошоим месяце\n{{ n }} месяцов",
    "date-year": "в прошлом году\n{{ n }} года\n{{ n }} лет"
});

define('app/i18n/it',{
    "postbox-text": "Scrivi un commento qui (minimo 3 caratteri)",
    "postbox-author": "Nome (opzionale)",
    "postbox-email": "E-mail (opzionale)",
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

    "date-now": "poco fa",
    "date-minute": "un minuto fa\n{{ n }} minuti fa",
    "date-hour": "un ora fa\n{{ n }} ore fa",
    "date-day": "Ieri\n{{ n }} giorni fa",
    "date-week": "questa settimana\n{{ n }} settimane fa",
    "date-month": "questo mese\n{{ n }} mesi fa",
    "date-year": "quest'anno\n{{ n }} anni fa"
});

define('app/i18n',["app/config", "app/i18n/de", "app/i18n/en", "app/i18n/fr", "app/i18n/ru", "app/i18n/it"], function(config, de, en, fr, ru, it) {

    

    // pluralization functions for each language you support
    var plurals = {
        "en": function(msgs, n) {
            return msgs[n === 1 ? 0 : 1];
        },
        "fr": function(msgs, n) {
            return msgs[n > 1 ? 0 : 1]
        },
        "ru": function(msg, n) {
            if (n % 10 === 1 && n % 100 !== 11) {
                return msg[0];
            } else if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) {
                return msg[1];
            } else {
                return msg[2] !== undefined ? msg[2] : msg[1];
            }
        }
    };

    plurals["de"] = plurals["en"];
    plurals["it"] = plurals["en"];

    // useragent's prefered language (or manually overridden)
    var lang = config.lang;

    // fall back to English
    if (!plurals[lang]) {
        lang = "en";
    }

    return {
        plurals: plurals,
        lang: lang,
        de: de,
        en: en,
        fr: fr,
        ru: ru,
        it: it
    };
});

define('text!app/text/forward.svg',[],function () { return '<!-- Generator: IcoMoon.io --><svg width="10" height="10" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" fill="gray">\n  <g>\n    <path d="M 17.961,11.954L 17.961,2 L 32,16L 17.961,30L 17.961,19.958 C 10.826,19.958, 3.784,21.2,0,27.094 C 0.394,16.353, 8.43,13.796, 17.961,11.954z">\n    </path>\n  </g>\n</svg>\n';});

define('text!app/text/arrow-down.svg',[],function () { return '<!-- Generator: IcoMoon.io --><svg width="16" height="16" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" fill="gray">\n  <g>\n    <path d="M 24.773,13.701c-0.651,0.669-7.512,7.205-7.512,7.205C 16.912,21.262, 16.456,21.44, 16,21.44c-0.458,0-0.914-0.178-1.261-0.534 c0,0-6.861-6.536-7.514-7.205c-0.651-0.669-0.696-1.87,0-2.586c 0.698-0.714, 1.669-0.77, 2.522,0L 16,17.112l 6.251-5.995 c 0.854-0.77, 1.827-0.714, 2.522,0C 25.47,11.83, 25.427,13.034, 24.773,13.701z">\n    </path>\n  </g>\n</svg>\n';});

define('text!app/text/arrow-up.svg',[],function () { return '<!-- Generator: IcoMoon.io --><svg width="16" height="16" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" fill="gray">\n  <g>\n    <path d="M 24.773,18.299c-0.651-0.669-7.512-7.203-7.512-7.203C 16.912,10.739, 16.456,10.56, 16,10.56c-0.458,0-0.914,0.179-1.261,0.536 c0,0-6.861,6.534-7.514,7.203c-0.651,0.669-0.696,1.872,0,2.586c 0.698,0.712, 1.669,0.77, 2.522,0L 16,14.89l 6.251,5.995 c 0.854,0.77, 1.827,0.712, 2.522,0C 25.47,20.17, 25.427,18.966, 24.773,18.299z">\n    </path>\n  </g>\n</svg>\n';});

define('app/text/svg',["text!./forward.svg", "text!./arrow-down.svg", "text!./arrow-up.svg"], function (forward, arrdown, arrup) {
    return {
        "forward": forward,
        "arrow-down": arrdown,
        "arrow-up": arrup
    };
});

define('app/markup',["vendor/markup", "app/i18n", "app/text/svg"], function(Mark, i18n, svg) {

    

    var pad = function(n, width, z) {
        z = z || '0';
        n = n + '';
        return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
    };

    // circumvent https://github.com/adammark/Markup.js/issues/22
    function merge(obj) {
        var result = {};
        for (var prefix in obj) {
            for (var attrname in obj[prefix]) {
                result[prefix + "-" + attrname] = obj[prefix][attrname];
            }
        }
        return result;
    }

    Mark.delimiter = ":";
    Mark.includes = merge({
        i18n: i18n[i18n.lang],
        svg: svg
    });

    Mark.pipes.datetime = function(date) {
        if (typeof date !== "object") {
            date = new Date(parseInt(date, 10) * 1000);
        }

        return [date.getUTCFullYear(), pad(date.getUTCMonth(), 2), pad(date.getUTCDay(), 2)].join("-");
    };

    Mark.pipes.substract = function(a, b) {
        return parseInt(a, 10) - parseInt(b, 10);
    };

    Mark.pipes.pluralize = function(str, n) {
        return i18n.plurals[i18n.lang](str.split("\n"), +n).trim();
    };

    var strip = function(string) {
        // allow whitespace between Markup.js delimiters such as
        // {{ var | pipe : arg }} instead of {{var|pipe:arg}}
        return string.replace(/\{\{\s*(.+?)\s*\}\}/g, function(match, val) {
            return ("{{" + val + "}}").replace(/\s*\|\s*/g, "|")
                                      .replace(/\s*\:\s*/g, ":");
        });
    };

    return {
        up: function(template, context) {
            return Mark.up(strip(template), context);
        }
    };
});
define('app/utils',["app/markup"], function(Mark) {

    // return `cookie` string if set
    var cookie = function(cookie) {
        return (document.cookie.match('(^|; )' + cookie + '=([^;]*)') || 0)[2];
    };

    var ago = function(date) {

        var diff = (((new Date()).getTime() - date.getTime()) / 1000),
            day_diff = Math.floor(diff / 86400);

        if (isNaN(day_diff) || day_diff < 0) {
            return;
        }

        var i18n = function(msgid, n) {
            if (! n) {
                return Mark.up("{{ i18n-" + msgid + " }}");
            } else {
                return Mark.up("{{ i18n-" + msgid + " | pluralize : `n` }}", {n: n});
            }
        };

        return day_diff === 0 && (
                diff <    60 && i18n("date-now")  ||
                diff <  3600 && i18n("date-minute", Math.floor(diff / 60)) ||
                diff < 86400 && i18n("date-hour", Math.floor(diff / 3600))) ||
            day_diff <   7 && i18n("date-day", day_diff) ||
            day_diff <  31 && i18n("date-week", Math.ceil(day_diff / 7)) ||
            day_diff < 365 && i18n("date-month", Math.ceil(day_diff / 30)) ||
            i18n("date-year", Math.ceil(day_diff / 365.25));
    };

    return {
        cookie: cookie,
        ago: ago
    };
});

define('app/lib/fancy',[],function() {

    

    // http://chuvash.eu/2011/12/14/the-cleanest-auto-resize-for-a-textarea/
    var autoresize = function(textarea, minheight) {
        var offset= !window.opera ? (textarea.offsetHeight - textarea.clientHeight) : (textarea.offsetHeight + parseInt(window.getComputedStyle(textarea, null).getPropertyValue('border-top-width')));
        ["keyup", "focus"].forEach(function(event) {
            textarea.on(event, function() {
                if ((textarea.scrollHeight  + offset ) > minheight) {
                    textarea.style.height = "auto";
                    textarea.style.height = (textarea.scrollHeight  + offset ) + 'px';
                }
            });
        });
    };

    return {
        autoresize: autoresize
    };
});

define('app/lib/identicons',["q"], function(Q) {

    

    // JS Identicon generation via Gregory Schier (http://codepen.io/gschier/pen/GLvAy)
    // extended to produce the same identicon for a given hash

    // Size of a grid square in pixels
    var SQUARE = 8;

    // Number of squares width and height
    var GRID = 5;

    // Padding on the edge of the canvas in px

    var pad = function(n, width) {
        return n.length >= width ? n : new Array(width - n.length + 1).join("0") + n;
    };

    /**
     * Fill in a square on the canvas.
     */
    var fill = function(svg, x, y, padding, size, color) {
        var rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");

        rect.setAttribute("x", padding + x * size);
        rect.setAttribute("y", padding + y * size);
        rect.setAttribute("width", size);
        rect.setAttribute("height", size);
        rect.setAttribute("style", "fill: " + color);

        svg.appendChild(rect);
    };

    /**
     * Pick random squares to fill in.
     */
    var generateIdenticon = function(key, padding, size) {

        var svg =  document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("version", "1.1");
        svg.setAttribute("viewBox", "0 0 " + size + " " + size);
        svg.setAttribute("preserveAspectRatio", "xMinYMin meet");
        svg.setAttribute("shape-rendering", "crispEdges");
        fill(svg, 0, 0, 0, size + 2*padding, "#F0F0F0");

        if (typeof key === null) {
            return svg;
        }

        Q.when(key, function(key) {
            var hash = pad((parseInt(key, 16) % Math.pow(2, 18)).toString(2), 18),
                index = 0, color = null;

            svg.setAttribute("data-hash", key);

            // via http://colrd.com/palette/19308/
            switch (hash.substring(hash.length - 3, hash.length)) {
            case "000":
                color = "#9abf88";
                break;
            case "001":
                color = "#5698c4";
                break;
            case "010":
                color = "#e279a3";
                break;
            case "011":
                color = "#9163b6";
                break;
            case "100":
                color = "#be5168";
                break;
            case "101":
                color = "#f19670";
                break;
            case "110":
                color = "#e4bf80";
                break;
            case "111":
                color = "#447c69";
                break;
            }

            // FILL THE SQUARES
            for (var x=0; x<Math.ceil(GRID/2); x++) {
                for (var y=0; y<GRID; y++) {

                    if (hash.charAt(index) === "1") {
                        fill(svg, x, y, padding, 8, color);

                        // FILL RIGHT SIDE SYMMETRICALLY
                        if (x < Math.floor(GRID/2)) {
                            fill(svg, (GRID-1) - x, y, padding, 8, color);
                        }
                    }
                    index++;
                }
            }
        });

        return svg;
    };

    var generateBlank = function(height, width) {

        var blank = parseInt([
            0, 1, 1, 1, 1,
            1, 0, 1, 1, 0,
            1, 1, 1, 1, 1, /* purple: */ 0, 1, 0
        ].join(""), 2).toString(16);

        var el = generateIdenticon(blank, height, width);
        el.setAttribute("className", "blank"); // IE10 does not support classList on SVG elements, duh.

        return el;
    };

    return {
        generate: generateIdenticon,
        blank: generateBlank
    };
});
/*
 * A JavaScript implementation of the Secure Hash Algorithm, SHA-1, as defined
 * in FIPS 180-1
 * Version 2.2 Copyright Paul Johnston 2000 - 2009.
 * Other contributors: Greg Holt, Andrew Kepert, Ydnar, Lostinet
 * Distributed under the BSD License
 * See http://pajhome.org.uk/crypt/md5 for details.
 */

define('app/lib/sha1',[],function() {
    /*
     * Configurable variables. You may need to tweak these to be compatible with
     * the server-side, but the defaults work in most cases.
     */
    var hexcase = 0;  /* hex output format. 0 - lowercase; 1 - uppercase        */
    var b64pad  = ""; /* base-64 pad character. "=" for strict RFC compliance   */

    /*
     * These are the functions you'll usually want to call
     * They take string arguments and return either hex or base-64 encoded strings
     */
    function hex_sha1(s)    { return rstr2hex(rstr_sha1(str2rstr_utf8(s))); }
    function b64_sha1(s)    { return rstr2b64(rstr_sha1(str2rstr_utf8(s))); }
    function any_sha1(s, e) { return rstr2any(rstr_sha1(str2rstr_utf8(s)), e); }
    function hex_hmac_sha1(k, d)
    { return rstr2hex(rstr_hmac_sha1(str2rstr_utf8(k), str2rstr_utf8(d))); }
    function b64_hmac_sha1(k, d)
    { return rstr2b64(rstr_hmac_sha1(str2rstr_utf8(k), str2rstr_utf8(d))); }
    function any_hmac_sha1(k, d, e)
    { return rstr2any(rstr_hmac_sha1(str2rstr_utf8(k), str2rstr_utf8(d)), e); }

    /*
     * Perform a simple self-test to see if the VM is working
     */
    function sha1_vm_test()
    {
        return hex_sha1("abc").toLowerCase() == "a9993e364706816aba3e25717850c26c9cd0d89d";
    }

    /*
     * Calculate the SHA1 of a raw string
     */
    function rstr_sha1(s)
    {
        return binb2rstr(binb_sha1(rstr2binb(s), s.length * 8));
    }

    /*
     * Calculate the HMAC-SHA1 of a key and some data (raw strings)
     */
    function rstr_hmac_sha1(key, data)
    {
        var bkey = rstr2binb(key);
        if(bkey.length > 16) bkey = binb_sha1(bkey, key.length * 8);

        var ipad = Array(16), opad = Array(16);
        for(var i = 0; i < 16; i++)
        {
            ipad[i] = bkey[i] ^ 0x36363636;
            opad[i] = bkey[i] ^ 0x5C5C5C5C;
        }

        var hash = binb_sha1(ipad.concat(rstr2binb(data)), 512 + data.length * 8);
        return binb2rstr(binb_sha1(opad.concat(hash), 512 + 160));
    }

    /*
     * Convert a raw string to a hex string
     */
    function rstr2hex(input)
    {
        try { hexcase } catch(e) { hexcase=0; }
        var hex_tab = hexcase ? "0123456789ABCDEF" : "0123456789abcdef";
        var output = "";
        var x;
        for(var i = 0; i < input.length; i++)
        {
            x = input.charCodeAt(i);
            output += hex_tab.charAt((x >>> 4) & 0x0F)
                +  hex_tab.charAt( x        & 0x0F);
        }
        return output;
    }

    /*
     * Convert a raw string to a base-64 string
     */
    function rstr2b64(input)
    {
        try { b64pad } catch(e) { b64pad=''; }
        var tab = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        var output = "";
        var len = input.length;
        for(var i = 0; i < len; i += 3)
        {
            var triplet = (input.charCodeAt(i) << 16)
                | (i + 1 < len ? input.charCodeAt(i+1) << 8 : 0)
                | (i + 2 < len ? input.charCodeAt(i+2)      : 0);
            for(var j = 0; j < 4; j++)
            {
                if(i * 8 + j * 6 > input.length * 8) output += b64pad;
                else output += tab.charAt((triplet >>> 6*(3-j)) & 0x3F);
            }
        }
        return output;
    }

    /*
     * Convert a raw string to an arbitrary string encoding
     */
    function rstr2any(input, encoding)
    {
        var divisor = encoding.length;
        var remainders = Array();
        var i, q, x, quotient;

        /* Convert to an array of 16-bit big-endian values, forming the dividend */
        var dividend = Array(Math.ceil(input.length / 2));
        for(i = 0; i < dividend.length; i++)
        {
            dividend[i] = (input.charCodeAt(i * 2) << 8) | input.charCodeAt(i * 2 + 1);
        }

        /*
         * Repeatedly perform a long division. The binary array forms the dividend,
         * the length of the encoding is the divisor. Once computed, the quotient
         * forms the dividend for the next step. We stop when the dividend is zero.
         * All remainders are stored for later use.
         */
        while(dividend.length > 0)
        {
            quotient = Array();
            x = 0;
            for(i = 0; i < dividend.length; i++)
            {
                x = (x << 16) + dividend[i];
                q = Math.floor(x / divisor);
                x -= q * divisor;
                if(quotient.length > 0 || q > 0)
                    quotient[quotient.length] = q;
            }
            remainders[remainders.length] = x;
            dividend = quotient;
        }

        /* Convert the remainders to the output string */
        var output = "";
        for(i = remainders.length - 1; i >= 0; i--)
            output += encoding.charAt(remainders[i]);

        /* Append leading zero equivalents */
        var full_length = Math.ceil(input.length * 8 /
            (Math.log(encoding.length) / Math.log(2)))
        for(i = output.length; i < full_length; i++)
            output = encoding[0] + output;

        return output;
    }

    /*
     * Encode a string as utf-8.
     * For efficiency, this assumes the input is valid utf-16.
     */
    function str2rstr_utf8(input)
    {
        var output = "";
        var i = -1;
        var x, y;

        while(++i < input.length)
        {
            /* Decode utf-16 surrogate pairs */
            x = input.charCodeAt(i);
            y = i + 1 < input.length ? input.charCodeAt(i + 1) : 0;
            if(0xD800 <= x && x <= 0xDBFF && 0xDC00 <= y && y <= 0xDFFF)
            {
                x = 0x10000 + ((x & 0x03FF) << 10) + (y & 0x03FF);
                i++;
            }

            /* Encode output as utf-8 */
            if(x <= 0x7F)
                output += String.fromCharCode(x);
            else if(x <= 0x7FF)
                output += String.fromCharCode(0xC0 | ((x >>> 6 ) & 0x1F),
                    0x80 | ( x         & 0x3F));
            else if(x <= 0xFFFF)
                output += String.fromCharCode(0xE0 | ((x >>> 12) & 0x0F),
                    0x80 | ((x >>> 6 ) & 0x3F),
                    0x80 | ( x         & 0x3F));
            else if(x <= 0x1FFFFF)
                output += String.fromCharCode(0xF0 | ((x >>> 18) & 0x07),
                    0x80 | ((x >>> 12) & 0x3F),
                    0x80 | ((x >>> 6 ) & 0x3F),
                    0x80 | ( x         & 0x3F));
        }
        return output;
    }

    /*
     * Encode a string as utf-16
     */
    function str2rstr_utf16le(input)
    {
        var output = "";
        for(var i = 0; i < input.length; i++)
            output += String.fromCharCode( input.charCodeAt(i)        & 0xFF,
                (input.charCodeAt(i) >>> 8) & 0xFF);
        return output;
    }

    function str2rstr_utf16be(input)
    {
        var output = "";
        for(var i = 0; i < input.length; i++)
            output += String.fromCharCode((input.charCodeAt(i) >>> 8) & 0xFF,
                input.charCodeAt(i)        & 0xFF);
        return output;
    }

    /*
     * Convert a raw string to an array of big-endian words
     * Characters >255 have their high-byte silently ignored.
     */
    function rstr2binb(input)
    {
        var output = Array(input.length >> 2);
        for(var i = 0; i < output.length; i++)
            output[i] = 0;
        for(var i = 0; i < input.length * 8; i += 8)
            output[i>>5] |= (input.charCodeAt(i / 8) & 0xFF) << (24 - i % 32);
        return output;
    }

    /*
     * Convert an array of big-endian words to a string
     */
    function binb2rstr(input)
    {
        var output = "";
        for(var i = 0; i < input.length * 32; i += 8)
            output += String.fromCharCode((input[i>>5] >>> (24 - i % 32)) & 0xFF);
        return output;
    }

    /*
     * Calculate the SHA-1 of an array of big-endian words, and a bit length
     */
    function binb_sha1(x, len)
    {
        /* append padding */
        x[len >> 5] |= 0x80 << (24 - len % 32);
        x[((len + 64 >> 9) << 4) + 15] = len;

        var w = Array(80);
        var a =  1732584193;
        var b = -271733879;
        var c = -1732584194;
        var d =  271733878;
        var e = -1009589776;

        for(var i = 0; i < x.length; i += 16)
        {
            var olda = a;
            var oldb = b;
            var oldc = c;
            var oldd = d;
            var olde = e;

            for(var j = 0; j < 80; j++)
            {
                if(j < 16) w[j] = x[i + j];
                else w[j] = bit_rol(w[j-3] ^ w[j-8] ^ w[j-14] ^ w[j-16], 1);
                var t = safe_add(safe_add(bit_rol(a, 5), sha1_ft(j, b, c, d)),
                    safe_add(safe_add(e, w[j]), sha1_kt(j)));
                e = d;
                d = c;
                c = bit_rol(b, 30);
                b = a;
                a = t;
            }

            a = safe_add(a, olda);
            b = safe_add(b, oldb);
            c = safe_add(c, oldc);
            d = safe_add(d, oldd);
            e = safe_add(e, olde);
        }
        return Array(a, b, c, d, e);

    }

    /*
     * Perform the appropriate triplet combination function for the current
     * iteration
     */
    function sha1_ft(t, b, c, d)
    {
        if(t < 20) return (b & c) | ((~b) & d);
        if(t < 40) return b ^ c ^ d;
        if(t < 60) return (b & c) | (b & d) | (c & d);
        return b ^ c ^ d;
    }

    /*
     * Determine the appropriate additive constant for the current iteration
     */
    function sha1_kt(t)
    {
        return (t < 20) ?  1518500249 : (t < 40) ?  1859775393 :
            (t < 60) ? -1894007588 : -899497514;
    }

    /*
     * Add integers, wrapping at 2^32. This uses 16-bit operations internally
     * to work around bugs in some JS interpreters.
     */
    function safe_add(x, y)
    {
        var lsw = (x & 0xFFFF) + (y & 0xFFFF);
        var msw = (x >> 16) + (y >> 16) + (lsw >> 16);
        return (msw << 16) | (lsw & 0xFFFF);
    }

    /*
     * Bitwise rotate a 32-bit number to the left.
     */
    function bit_rol(num, cnt)
    {
        return (num << cnt) | (num >>> (32 - cnt));
    }

    return {
        rstr2hex: rstr2hex, binb2rstr: binb2rstr,
        binb_sha1: binb_sha1, rstr2binb: rstr2binb
    }
})
;
define('app/lib/pbkdf2',["q", "app/lib/sha1"], function(Q, sha1) {
    /*
     * JavaScript implementation of Password-Based Key Derivation Function 2
     * (PBKDF2) as defined in RFC 2898.
     * Version 1.5
     * Copyright (c) 2007, 2008, 2009, 2010, 2011, 2012, 2013 Parvez Anandam
     * parvez@anandam.com
     * http://anandam.com/pbkdf2
     *
     * Distributed under the BSD license
     *
     * Uses Paul Johnston's excellent SHA-1 JavaScript library sha1.js:
     * http://pajhome.org.uk/crypt/md5/sha1.html
     * (uses the binb_sha1(), rstr2binb(), binb2str(), rstr2hex() functions from that libary)
     *
     * Thanks to Felix Gartsman for pointing out a bug in version 1.0
     * Thanks to Thijs Van der Schaeghe for pointing out a bug in version 1.1
     * Thanks to Richard Gautier for asking to clarify dependencies in version 1.2
     * Updated contact information from version 1.3
     * Thanks to Stuart Heinrich for pointing out updates to PAJ's SHA-1 library in version 1.4
     */


    /*
     * The four arguments to the constructor of the PBKDF2 object are
     * the password, salt, number of iterations and number of bytes in
     * generated key. This follows the RFC 2898 definition: PBKDF2 (P, S, c, dkLen)
     *
     * The method deriveKey takes two parameters, both callback functions:
     * the first is used to provide status on the computation, the second
     * is called with the result of the computation (the generated key in hex).
     *
     * Example of use:
     *
     *    <script src="sha1.js"></script>
     *    <script src="pbkdf2.js"></script>
     *    <script>
     *    var mypbkdf2 = new PBKDF2("mypassword", "saltines", 1000, 16);
     *    var status_callback = function(percent_done) {
     *        document.getElementById("status").innerHTML = "Computed " + percent_done + "%"};
     *    var result_callback = function(key) {
     *        document.getElementById("status").innerHTML = "The derived key is: " + key};
     *    mypbkdf2.deriveKey(status_callback, result_callback);
     *    </script>
     *    <div id="status"></div>
     *
     */

    var PBKDF2 = function(password, salt, num_iterations, num_bytes)
    {
        // Remember the password and salt
        var m_bpassword = sha1.rstr2binb(password);
        var m_salt = salt;

        // Total number of iterations
        var m_total_iterations = num_iterations;

        // Run iterations in chunks instead of all at once, so as to not block.
        // Define size of chunk here; adjust for slower or faster machines if necessary.
        var m_iterations_in_chunk = 10;

        // Iteration counter
        var m_iterations_done = 0;

        // Key length, as number of bytes
        var m_key_length = num_bytes;

        // The hash cache
        var m_hash = null;

        // The length (number of bytes) of the output of the pseudo-random function.
        // Since HMAC-SHA1 is the standard, and what is used here, it's 20 bytes.
        var m_hash_length = 20;

        // Number of hash-sized blocks in the derived key (called 'l' in RFC2898)
        var m_total_blocks = Math.ceil(m_key_length/m_hash_length);

        // Start computation with the first block
        var m_current_block = 1;

        // Used in the HMAC-SHA1 computations
        var m_ipad = new Array(16);
        var m_opad = new Array(16);

        // This is where the result of the iterations gets sotred
        var m_buffer = new Array(0x0,0x0,0x0,0x0,0x0);

        // The result
        var m_key = "";

        // This object
        var m_this_object = this;

        // The function to call with the result
        var m_result_func;

        // The function to call with status after computing every chunk
        var m_status_func;

        // Set up the HMAC-SHA1 computations
        if (m_bpassword.length > 16) m_bpassword = sha1.binb_sha1(m_bpassword, password.length * chrsz);
        for(var i = 0; i < 16; ++i)
        {
            m_ipad[i] = m_bpassword[i] ^ 0x36363636;
            m_opad[i] = m_bpassword[i] ^ 0x5C5C5C5C;
        }


        // Starts the computation
        this.deriveKey = function(status_callback, result_callback)
        {
            m_status_func = status_callback;
            m_result_func = result_callback;
            setTimeout(function() { m_this_object.do_PBKDF2_iterations() }, 0);
        }


        // The workhorse
        this.do_PBKDF2_iterations = function()
        {
            var iterations = m_iterations_in_chunk;
            if (m_total_iterations - m_iterations_done < m_iterations_in_chunk)
                iterations = m_total_iterations - m_iterations_done;

            for(var i=0; i<iterations; ++i)
            {
                // compute HMAC-SHA1
                if (m_iterations_done == 0)
                {
                    var salt_block = m_salt +
                        String.fromCharCode(m_current_block >> 24 & 0xF) +
                        String.fromCharCode(m_current_block >> 16 & 0xF) +
                        String.fromCharCode(m_current_block >>  8 & 0xF) +
                        String.fromCharCode(m_current_block       & 0xF);

                    m_hash = sha1.binb_sha1(m_ipad.concat(sha1.rstr2binb(salt_block)),
                        512 + salt_block.length * 8);
                    m_hash = sha1.binb_sha1(m_opad.concat(m_hash), 512 + 160);
                }
                else
                {
                    m_hash = sha1.binb_sha1(m_ipad.concat(m_hash),
                        512 + m_hash.length * 32);
                    m_hash = sha1.binb_sha1(m_opad.concat(m_hash), 512 + 160);
                }

                for(var j=0; j<m_hash.length; ++j)
                    m_buffer[j] ^= m_hash[j];

                m_iterations_done++;
            }

            // Call the status callback function
            m_status_func( (m_current_block - 1 + m_iterations_done/m_total_iterations) / m_total_blocks * 100);

            if (m_iterations_done < m_total_iterations)
            {
                setTimeout(function() { m_this_object.do_PBKDF2_iterations() }, 0);
            }
            else
            {
                if (m_current_block < m_total_blocks)
                {
                    // Compute the next block (T_i in RFC 2898)

                    m_key += sha1.rstr2hex(sha1.binb2rstr(m_buffer));

                    m_current_block++;
                    m_buffer = new Array(0x0,0x0,0x0,0x0,0x0);
                    m_iterations_done = 0;

                    setTimeout(function() { m_this_object.do_PBKDF2_iterations() }, 0);
                }
                else
                {
                    // We've computed the final block T_l; we're done.

                    var tmp = sha1.rstr2hex(sha1.binb2rstr(m_buffer));
                    m_key += tmp.substr(0, (m_key_length - (m_total_blocks - 1) * m_hash_length) * 2 );

                    // Call the result callback function
                    m_result_func(m_key);
                }
            }
        }
    }

    return function(text, salt, iterations, size) {

        var deferred = Q.defer();

        Q.when(text, function(text) {
            var pbkdf2 = new PBKDF2(text, salt, iterations, size);
            pbkdf2.deriveKey(function(bla) {}, function(rv) {
                deferred.resolve(rv);
            });
        })

        return deferred.promise;
    }
});
define('app/lib',['require','app/lib/fancy','app/lib/identicons','app/lib/pbkdf2','app/lib/sha1'],function (require) {
    return {
        fancy: require("app/lib/fancy"),
        identicons: require("app/lib/identicons"),
        pbkdf2: require("app/lib/pbkdf2"),
        sha1: require("app/lib/sha1")
    };
});

/* Isso – Ich schrei sonst!
 */
define('app/isso',["app/text/html", "app/dom", "app/utils", "app/config", "app/api", "app/markup", "app/i18n", "app/lib"],
    function(templates, $, utils, config, api, Mark, i18n, lib) {

    

    var msgs = i18n[i18n.lang];

    var Postbox = function(parent) {

        var el = $.htmlify(Mark.up(templates["postbox"]));

        // add a default identicon to not waste CPU cycles
        $(".avatar > svg", el).replace(lib.identicons.blank(4, 48));

        // on text area focus, generate identicon from IP address
        $(".textarea-wrapper > textarea", el).on("focus", function() {
            if ($(".avatar svg", el).getAttribute("className") === "blank") {
                $(".avatar svg", el).replace(
                    lib.identicons.generate(lib.pbkdf2(api.remote_addr(), api.salt, 1000, 6), 4, 48));
            }
        });

        // update identicon on email input. Listens on keyup, after 200ms the
        // new identicon is generated.
        var active;
        $(".input-wrapper > [type=email]", el).on("keyup", function() {
            if (active) {
                clearTimeout(active);
            }
            active = setTimeout(function() {
                lib.pbkdf2($(".input-wrapper > [type=email]", el).value || api.remote_addr(), api.salt, 1000, 6)
                .then(function(rv) {
                    $(".avatar svg", el).replace(lib.identicons.generate(rv, 4, 48));
                });
            }, 200);
        }, false);

        $(".input-wrapper > [type=email]", el).on("keydown", function() {
            clearTimeout(active);
        }, false);

        // callback on success (e.g. to toggle the reply button)
        el.onsuccess = function() {};

        el.validate = function() {
            if ($("textarea", this).value.length < 3) {
                $("textarea", this).focus();
                return false;
            }
            return true;
        };

        // submit form, initialize optional fields with `null` and reset form.
        // If replied to a comment, remove form completely.
        $("[type=submit]", el).on("click", function() {
            if (! el.validate()) {
                return;
            }

            api.create($("#isso-thread").getAttribute("data-isso-id"), {
                author: $("[name=author]", el).value || null,
                email: $("[name=email]", el).value || null,
                text: $("textarea", el).value,
                parent: parent || null
            }).then(function(comment) {
                $("[name=author]", el).value = "";
                $("[name=email]", el).value = "";
                $("textarea", el).value = "";
                $("textarea", el).rows = 2;
                $("textarea", el).blur();
                insert(comment, true);

                if (parent !== null) {
                    el.onsuccess();
                    el.remove();
                }
            });
        });

        // copy'n'paste sluggy automagically dynamic textarea resize
        lib.fancy.autoresize($("textarea", el), 48);

        return el;
    };

    // lookup table for responses (to link to the parent)
    var map  = {id: {}, name: {}};

    var insert = function(comment, scrollIntoView) {

        map.name[comment.id] = comment.author;
        if (comment.parent) {
            comment["replyto"] = map.name[comment.parent];
        }

        var el = $.htmlify(Mark.up(templates["comment"], comment));

        // update datetime every 60 seconds
        var refresh = function() {
            $(".permalink > date", el).textContent = utils.ago(
                new Date(parseInt(comment.created, 10) * 1000));
            setTimeout(refresh, 60*1000);
        };

        // run once to activate
        refresh();

        $("div.avatar > svg", el).replace(lib.identicons.generate(comment.hash, 4, 48));

        var entrypoint;
        if (comment.parent === null) {
            entrypoint = $("#isso-root");
        } else {
            var key = comment.parent;
            while (key in map.id) {
                key = map.id[key];
            }
            map.id[comment.id] = comment.parent;
            entrypoint = $("#isso-" + key + " > .text-wrapper > .isso-follow-up");
        }

        entrypoint.append(el);

        if (scrollIntoView) {
            el.scrollIntoView();
        }

        var footer = $("#isso-" + comment.id + " > .text-wrapper > .isso-comment-footer"),
            header = $("#isso-" + comment.id + " > .text-wrapper > .isso-comment-header"),
            text   = $("#isso-" + comment.id + " > .text-wrapper > .text");

        var form = null;  // XXX: probably a good place for a closure
        $("a.reply", footer).toggle("click",
            function(toggler) {
                form = footer.insertAfter(new Postbox(comment.id));
                form.onsuccess = function() { toggler.next(); };
                $("textarea", form).focus();
                $("a.reply", footer).textContent = msgs["comment-close"];
            },
            function() {
                form.remove();
                $("a.reply", footer).textContent = msgs["comment-reply"];
            }
        );

        if (comment.parent !== null) {
            $("a.parent", header).on("mouseover", function() {
                $("#isso-" + comment.parent).classList.add("parent-highlight");
            });
            $("a.parent", header).on("mouseout", function() {
                $("#isso-" + comment.parent).classList.remove("parent-highlight");
            });
        }

        // update vote counter, but hide if votes sum to 0
        var votes = function(value) {
            var span = $("span.votes", footer);
            if (span === null) {
                if (value === 0) {
                    span.remove();
                } else {
                    footer.prepend($.new("span.votes", value));
                }
            } else {
                if (value === 0) {
                    span.remove();
                } else {
                    span.textContent = value;
                }
            }
        };

        $("a.upvote", footer).on("click", function() {
            api.like(comment.id).then(function(rv) {
                votes(rv.likes - rv.dislikes);
            });
        });

        $("a.downvote", footer).on("click", function() {
            api.dislike(comment.id).then(function(rv) {
                votes(rv.likes - rv.dislikes);
            });
        });

        $("a.edit", footer).toggle("click",
            function(toggler) {
                var edit = $("a.edit", footer);

                edit.textContent = msgs["comment-save"];
                edit.insertAfter($.new("a.cancel", msgs["comment-cancel"])).on("click", function() {
                    text.textContent = "";
                    text.className = "text";
                    text.append(comment.text);
                    toggler.next();
                });

                api.view(comment.id, 1).then(function(rv) {
                    var textarea = $.new("textarea", rv.text);
                    lib.fancy.autoresize(textarea, 48);
                    text.className = "textarea-wrapper";
                    text.textContent = "";
                    text.append(textarea);
                    textarea.focus();
                });
            },
            function(toggler) {
                var textarea = $("textarea", text);
                if (textarea && textarea.value.length < 3) {
                    textarea.focus();
                    toggler.wait();
                    return;
                } else if (textarea) {
                    api.modify(comment.id, {"text": textarea.value}).then(function(rv) {
                        text.innerHTML = rv.text;
                        text.className = "text";
                        comment.text = rv.text;
                    });
                }

                $("a.cancel", footer).remove();
                $("a.edit", footer).textContent = msgs["comment-edit"];
            }
        );

        $("a.delete", footer).toggle("click",
            function(toggler) {
                var del = $("a.delete", footer);
                var state = ! toggler.state;

                del.textContent = msgs["comment-confirm"];
                del.on("mouseout", function() {
                    del.textContent = msgs["comment-delete"];
                    toggler.state = state;
                    del.onmouseout = null;
                });
            },
            function() {
                var del = $("a.delete", footer);
                api.remove(comment.id).then(function(rv) {
                    if (rv) {
                        el.remove();
                    } else {
                        $("span.note", header).textContent = msgs["comment-deleted"];
                        text.innerHTML = "<p>&nbsp;</p>";
                        $("a.edit", footer).remove()
                        $("a.delete", footer).remove()
                    }
                    del.textContent = msgs["comment-delete"];
                });
            }
        );

        // remove edit and delete buttons when cookie is gone
        var clear = function(button) {
            if (! utils.cookie("isso-" + comment.id)) {
                if ($(button, footer) !== null) {
                    $(button, footer).remove();
                }
            } else {
                setTimeout(function() { clear(button); }, 15*1000);
            }
        };

        clear("a.edit");
        clear("a.delete");

        // show direct reply to own comment when cookie is max aged
        var show = function(el) {
            if (utils.cookie("isso-" + comment.id)) {
                setTimeout(function() { show(el); }, 15*1000);
            } else {
                footer.append(el);
            }
        };

        if (! config["reply-to-self"] && utils.cookie("isso-" + comment.id)) {
            show($("a.reply", footer).detach());
        }
    };

    return {
        insert: insert,
        Postbox: Postbox
    };
});

define('app/count',["app/api", "app/dom", "app/markup"], function(api, $, Mark) {
    return function() {
        $.each("a", function(el) {
            if (! el.href.match("#isso-thread$")) {
                return;
            }

            var tid = el.getAttribute("data-isso-id") ||
                      el.href.match("^(.+)#isso-thread$")[1]
                             .replace(/^.*\/\/[^\/]+/, '');

            api.count(tid).then(function(rv) {
                el.textContent = Mark.up("{{ i18n-num-comments | pluralize : `n` }}", {n: rv});
            });
        });
    };
});

define('text!app/../../css/isso.css',[],function () { return '@media -sass-debug-info{filename{font-family:file\\:\\/\\/\\/Users\\/ich\\/dev\\/isso\\/isso\\/css\\/neat\\/grid\\/_grid\\.scss}line{font-family:\\000032}}\n* {\n  -webkit-box-sizing: border-box;\n  -moz-box-sizing: border-box;\n  box-sizing: border-box; }\n\n@media -sass-debug-info{filename{font-family:file\\:\\/\\/\\/Users\\/ich\\/dev\\/isso\\/isso\\/css\\/isso\\.scss}line{font-family:\\0000317}}\na {\n  text-decoration: none; }\n\n@media -sass-debug-info{filename{font-family:file\\:\\/\\/\\/Users\\/ich\\/dev\\/isso\\/isso\\/css\\/isso\\.scss}line{font-family:\\0000321}}\n#isso-thread {\n  padding: 0;\n  margin: 0; }\n@media -sass-debug-info{filename{font-family:file\\:\\/\\/\\/Users\\/ich\\/dev\\/isso\\/isso\\/css\\/isso\\.scss}line{font-family:\\0000325}}\n  #isso-thread > h4 {\n    color: #555;\n    font-weight: bold;\n    font-family: "Helvetica", Arial, sans-serif; }\n\n@media -sass-debug-info{filename{font-family:file\\:\\/\\/\\/Users\\/ich\\/dev\\/isso\\/isso\\/css\\/isso\\.scss}line{font-family:\\0000332}}\n.parent-highlight {\n  background-color: #EFEFEF; }\n\n@media -sass-debug-info{filename{font-family:file\\:\\/\\/\\/Users\\/ich\\/dev\\/isso\\/isso\\/css\\/isso\\.scss}line{font-family:\\0000336}}\n.isso-comment {\n  *zoom: 1;\n  max-width: 68em;\n  margin-left: auto;\n  margin-right: auto;\n  margin: 0.95em 0px; }\n@media -sass-debug-info{filename{font-family:file\\:\\/\\/\\/Users\\/ich\\/dev\\/isso\\/isso\\/css\\/bourbon\\/addons\\/_clearfix\\.scss}line{font-family:\\0000318}}\n  .isso-comment:before, .isso-comment:after {\n    content: " ";\n    display: table; }\n@media -sass-debug-info{filename{font-family:file\\:\\/\\/\\/Users\\/ich\\/dev\\/isso\\/isso\\/css\\/bourbon\\/addons\\/_clearfix\\.scss}line{font-family:\\0000323}}\n  .isso-comment:after {\n    clear: both; }\n@media -sass-debug-info{filename{font-family:file\\:\\/\\/\\/Users\\/ich\\/dev\\/isso\\/isso\\/css\\/isso\\.scss}line{font-family:\\0000341}}\n  .isso-comment > div.avatar {\n    display: block;\n    float: left;\n    margin-right: 2.57751%;\n    width: 6.74772%; }\n@media -sass-debug-info{filename{font-family:file\\:\\/\\/\\/Users\\/ich\\/dev\\/isso\\/isso\\/css\\/neat\\/grid\\/_span-columns\\.scss}line{font-family:\\0000333}}\n    .isso-comment > div.avatar:last-child {\n      margin-right: 0; }\n@media -sass-debug-info{filename{font-family:file\\:\\/\\/\\/Users\\/ich\\/dev\\/isso\\/isso\\/css\\/isso\\.scss}line{font-family:\\0000344}}\n    .isso-comment > div.avatar > svg {\n      border: 1px solid #f0f0f0;\n      border-radius: 2px;\n      box-shadow: 0px 0px 2px #888;\n      max-height: 48px; }\n@media -sass-debug-info{filename{font-family:file\\:\\/\\/\\/Users\\/ich\\/dev\\/isso\\/isso\\/css\\/isso\\.scss}line{font-family:\\0000350}}\n  .isso-comment > div.text-wrapper {\n    display: block;\n    float: left;\n    margin-right: 2.57751%;\n    width: 90.67477%; }\n@media -sass-debug-info{filename{font-family:file\\:\\/\\/\\/Users\\/ich\\/dev\\/isso\\/isso\\/css\\/neat\\/grid\\/_span-columns\\.scss}line{font-family:\\0000333}}\n    .isso-comment > div.text-wrapper:last-child {\n      margin-right: 0; }\n@media -sass-debug-info{filename{font-family:file\\:\\/\\/\\/Users\\/ich\\/dev\\/isso\\/isso\\/css\\/isso\\.scss}line{font-family:\\0000353}}\n    .isso-comment > div.text-wrapper > .isso-comment-header, .isso-comment > div.text-wrapper > .isso-comment-footer {\n      font-size: 0.95em; }\n@media -sass-debug-info{filename{font-family:file\\:\\/\\/\\/Users\\/ich\\/dev\\/isso\\/isso\\/css\\/isso\\.scss}line{font-family:\\0000357}}\n    .isso-comment > div.text-wrapper > .isso-comment-header {\n      font-family: "Helvetica", Arial, sans-serif;\n      font-size: 0.85em; }\n@media -sass-debug-info{filename{font-family:file\\:\\/\\/\\/Users\\/ich\\/dev\\/isso\\/isso\\/css\\/isso\\.scss}line{font-family:\\0000361}}\n      .isso-comment > div.text-wrapper > .isso-comment-header .spacer {\n        padding-left: 6px;\n        padding-right: 6px; }\n@media -sass-debug-info{filename{font-family:file\\:\\/\\/\\/Users\\/ich\\/dev\\/isso\\/isso\\/css\\/isso\\.scss}line{font-family:\\0000366}}\n      .isso-comment > div.text-wrapper > .isso-comment-header .spacer, .isso-comment > div.text-wrapper > .isso-comment-header a.permalink, .isso-comment > div.text-wrapper > .isso-comment-header .note, .isso-comment > div.text-wrapper > .isso-comment-header a.parent {\n        color: gray !important;\n        font-weight: normal;\n        text-shadow: none !important; }\n@media -sass-debug-info{filename{font-family:file\\:\\/\\/\\/Users\\/ich\\/dev\\/isso\\/isso\\/css\\/isso\\.scss}line{font-family:\\0000372}}\n        .isso-comment > div.text-wrapper > .isso-comment-header .spacer:hover, .isso-comment > div.text-wrapper > .isso-comment-header a.permalink:hover, .isso-comment > div.text-wrapper > .isso-comment-header .note:hover, .isso-comment > div.text-wrapper > .isso-comment-header a.parent:hover {\n          color: #606060 !important; }\n@media -sass-debug-info{filename{font-family:file\\:\\/\\/\\/Users\\/ich\\/dev\\/isso\\/isso\\/css\\/isso\\.scss}line{font-family:\\0000377}}\n      .isso-comment > div.text-wrapper > .isso-comment-header .note {\n        float: right; }\n@media -sass-debug-info{filename{font-family:file\\:\\/\\/\\/Users\\/ich\\/dev\\/isso\\/isso\\/css\\/isso\\.scss}line{font-family:\\0000379}}\n      .isso-comment > div.text-wrapper > .isso-comment-header .author {\n        font-weight: bold;\n        color: #555; }\n@media -sass-debug-info{filename{font-family:file\\:\\/\\/\\/Users\\/ich\\/dev\\/isso\\/isso\\/css\\/isso\\.scss}line{font-family:\\0000387}}\n    .isso-comment > div.text-wrapper > div.text p {\n      margin-top: 0.2em; }\n@media -sass-debug-info{filename{font-family:file\\:\\/\\/\\/Users\\/ich\\/dev\\/isso\\/isso\\/css\\/isso\\.scss}line{font-family:\\0000390}}\n      .isso-comment > div.text-wrapper > div.text p:last-child {\n        margin-bottom: 0.2em; }\n@media -sass-debug-info{filename{font-family:file\\:\\/\\/\\/Users\\/ich\\/dev\\/isso\\/isso\\/css\\/isso\\.scss}line{font-family:\\0000395}}\n    .isso-comment > div.text-wrapper > div.text h1, .isso-comment > div.text-wrapper > div.text h2, .isso-comment > div.text-wrapper > div.text h3, .isso-comment > div.text-wrapper > div.text h4, .isso-comment > div.text-wrapper > div.text h5, .isso-comment > div.text-wrapper > div.text h6 {\n      font-size: 100%; }\n@media -sass-debug-info{filename{font-family:file\\:\\/\\/\\/Users\\/ich\\/dev\\/isso\\/isso\\/css\\/isso\\.scss}line{font-family:\\00003101}}\n    .isso-comment > div.text-wrapper > div.textarea-wrapper textarea {\n      width: 100%;\n      border: 1px solid #f0f0f0;\n      border-radius: 2px;\n      box-shadow: 0px 0px 2px #888;\n      font: inherit; }\n@media -sass-debug-info{filename{font-family:file\\:\\/\\/\\/Users\\/ich\\/dev\\/isso\\/isso\\/css\\/isso\\.scss}line{font-family:\\00003107}}\n    .isso-comment > div.text-wrapper > .isso-comment-footer {\n      font-family: "Helvetica", Arial, sans-serif;\n      font-size: 0.80em;\n      color: gray !important; }\n@media -sass-debug-info{filename{font-family:file\\:\\/\\/\\/Users\\/ich\\/dev\\/isso\\/isso\\/css\\/isso\\.scss}line{font-family:\\00003114}}\n      .isso-comment > div.text-wrapper > .isso-comment-footer a {\n        font-weight: bold;\n        text-decoration: none; }\n@media -sass-debug-info{filename{font-family:file\\:\\/\\/\\/Users\\/ich\\/dev\\/isso\\/isso\\/css\\/isso\\.scss}line{font-family:\\00003117}}\n        .isso-comment > div.text-wrapper > .isso-comment-footer a:hover {\n          color: #111111 !important;\n          text-shadow: #aaaaaa 0px 0px 1px !important; }\n@media -sass-debug-info{filename{font-family:file\\:\\/\\/\\/Users\\/ich\\/dev\\/isso\\/isso\\/css\\/isso\\.scss}line{font-family:\\00003123}}\n      .isso-comment > div.text-wrapper > .isso-comment-footer a.reply, .isso-comment > div.text-wrapper > .isso-comment-footer a.edit, .isso-comment > div.text-wrapper > .isso-comment-footer a.cancel, .isso-comment > div.text-wrapper > .isso-comment-footer a.delete {\n        padding-left: 1em; }\n@media -sass-debug-info{filename{font-family:file\\:\\/\\/\\/Users\\/ich\\/dev\\/isso\\/isso\\/css\\/isso\\.scss}line{font-family:\\00003127}}\n      .isso-comment > div.text-wrapper > .isso-comment-footer .votes {\n        color: gray; }\n@media -sass-debug-info{filename{font-family:file\\:\\/\\/\\/Users\\/ich\\/dev\\/isso\\/isso\\/css\\/isso\\.scss}line{font-family:\\00003131}}\n      .isso-comment > div.text-wrapper > .isso-comment-footer .upvote svg, .isso-comment > div.text-wrapper > .isso-comment-footer .downvote svg {\n        position: relative;\n        top: 0.2em; }\n@media -sass-debug-info{filename{font-family:file\\:\\/\\/\\/Users\\/ich\\/dev\\/isso\\/isso\\/css\\/isso\\.scss}line{font-family:\\00003138}}\n  .isso-comment .postbox {\n    margin-top: 0.8em; }\n\n@media -sass-debug-info{filename{font-family:file\\:\\/\\/\\/Users\\/ich\\/dev\\/isso\\/isso\\/css\\/isso\\.scss}line{font-family:\\00003143}}\n.postbox {\n  *zoom: 1;\n  max-width: 68em;\n  margin-left: auto;\n  margin-right: auto; }\n@media -sass-debug-info{filename{font-family:file\\:\\/\\/\\/Users\\/ich\\/dev\\/isso\\/isso\\/css\\/bourbon\\/addons\\/_clearfix\\.scss}line{font-family:\\0000318}}\n  .postbox:before, .postbox:after {\n    content: " ";\n    display: table; }\n@media -sass-debug-info{filename{font-family:file\\:\\/\\/\\/Users\\/ich\\/dev\\/isso\\/isso\\/css\\/bourbon\\/addons\\/_clearfix\\.scss}line{font-family:\\0000323}}\n  .postbox:after {\n    clear: both; }\n@media -sass-debug-info{filename{font-family:file\\:\\/\\/\\/Users\\/ich\\/dev\\/isso\\/isso\\/css\\/isso\\.scss}line{font-family:\\00003146}}\n  .postbox > .avatar {\n    display: block;\n    float: left;\n    margin-right: 2.57751%;\n    width: 6.74772%; }\n@media -sass-debug-info{filename{font-family:file\\:\\/\\/\\/Users\\/ich\\/dev\\/isso\\/isso\\/css\\/neat\\/grid\\/_span-columns\\.scss}line{font-family:\\0000333}}\n    .postbox > .avatar:last-child {\n      margin-right: 0; }\n@media -sass-debug-info{filename{font-family:file\\:\\/\\/\\/Users\\/ich\\/dev\\/isso\\/isso\\/css\\/isso\\.scss}line{font-family:\\00003149}}\n    .postbox > .avatar > svg {\n      border: 1px solid #f0f0f0;\n      border-radius: 2px;\n      box-shadow: 0px 0px 2px #888;\n      max-height: 48px; }\n@media -sass-debug-info{filename{font-family:file\\:\\/\\/\\/Users\\/ich\\/dev\\/isso\\/isso\\/css\\/isso\\.scss}line{font-family:\\00003155}}\n  .postbox > .form-wrapper {\n    display: block;\n    float: left;\n    margin-right: 2.57751%;\n    width: 90.67477%; }\n@media -sass-debug-info{filename{font-family:file\\:\\/\\/\\/Users\\/ich\\/dev\\/isso\\/isso\\/css\\/neat\\/grid\\/_span-columns\\.scss}line{font-family:\\0000333}}\n    .postbox > .form-wrapper:last-child {\n      margin-right: 0; }\n@media -sass-debug-info{filename{font-family:file\\:\\/\\/\\/Users\\/ich\\/dev\\/isso\\/isso\\/css\\/isso\\.scss}line{font-family:\\00003158}}\n    .postbox > .form-wrapper textarea {\n      width: 100%;\n      border: 1px solid #f0f0f0;\n      border-radius: 2px;\n      box-shadow: 0px 0px 2px #888;\n      min-height: 48px;\n      font: inherit; }\n@media -sass-debug-info{filename{font-family:file\\:\\/\\/\\/Users\\/ich\\/dev\\/isso\\/isso\\/css\\/bourbon\\/css3\\/_placeholder\\.scss}line{font-family:\\000038}}\n      .postbox > .form-wrapper textarea::-webkit-input-placeholder {\n        color: #AAA; }\n@media -sass-debug-info{filename{font-family:file\\:\\/\\/\\/Users\\/ich\\/dev\\/isso\\/isso\\/css\\/bourbon\\/css3\\/_placeholder\\.scss}line{font-family:\\0000314}}\n      .postbox > .form-wrapper textarea:-moz-placeholder {\n        color: #AAA; }\n@media -sass-debug-info{filename{font-family:file\\:\\/\\/\\/Users\\/ich\\/dev\\/isso\\/isso\\/css\\/bourbon\\/css3\\/_placeholder\\.scss}line{font-family:\\0000319}}\n      .postbox > .form-wrapper textarea::-moz-placeholder {\n        color: #AAA; }\n@media -sass-debug-info{filename{font-family:file\\:\\/\\/\\/Users\\/ich\\/dev\\/isso\\/isso\\/css\\/bourbon\\/css3\\/_placeholder\\.scss}line{font-family:\\0000324}}\n      .postbox > .form-wrapper textarea:-ms-input-placeholder {\n        color: #AAA; }\n@media -sass-debug-info{filename{font-family:file\\:\\/\\/\\/Users\\/ich\\/dev\\/isso\\/isso\\/css\\/isso\\.scss}line{font-family:\\00003169}}\n    .postbox > .form-wrapper > .textarea-wrapper {\n      margin-bottom: 0.2em; }\n@media -sass-debug-info{filename{font-family:file\\:\\/\\/\\/Users\\/ich\\/dev\\/isso\\/isso\\/css\\/isso\\.scss}line{font-family:\\00003173}}\n    .postbox > .form-wrapper > .auth-section {\n      *zoom: 1;\n      max-width: 68em;\n      margin-left: auto;\n      margin-right: auto; }\n@media -sass-debug-info{filename{font-family:file\\:\\/\\/\\/Users\\/ich\\/dev\\/isso\\/isso\\/css\\/bourbon\\/addons\\/_clearfix\\.scss}line{font-family:\\0000318}}\n      .postbox > .form-wrapper > .auth-section:before, .postbox > .form-wrapper > .auth-section:after {\n        content: " ";\n        display: table; }\n@media -sass-debug-info{filename{font-family:file\\:\\/\\/\\/Users\\/ich\\/dev\\/isso\\/isso\\/css\\/bourbon\\/addons\\/_clearfix\\.scss}line{font-family:\\0000323}}\n      .postbox > .form-wrapper > .auth-section:after {\n        clear: both; }\n@media -sass-debug-info{filename{font-family:file\\:\\/\\/\\/Users\\/ich\\/dev\\/isso\\/isso\\/css\\/isso\\.scss}line{font-family:\\00003176}}\n      .postbox > .form-wrapper > .auth-section .input-wrapper {\n        display: block;\n        float: left;\n        margin-right: 5.85151%;\n        width: 36.4891%;\n        margin-top: 0.1em; }\n@media -sass-debug-info{filename{font-family:file\\:\\/\\/\\/Users\\/ich\\/dev\\/isso\\/isso\\/css\\/neat\\/grid\\/_span-columns\\.scss}line{font-family:\\0000333}}\n        .postbox > .form-wrapper > .auth-section .input-wrapper:last-child {\n          margin-right: 0; }\n@media -sass-debug-info{filename{font-family:file\\:\\/\\/\\/Users\\/ich\\/dev\\/isso\\/isso\\/css\\/isso\\.scss}line{font-family:\\00003181}}\n        .postbox > .form-wrapper > .auth-section .input-wrapper input {\n          width: 100%;\n          border: 1px solid #f0f0f0;\n          border-radius: 2px;\n          box-shadow: 0px 0px 2px #888;\n          padding: 0.2em;\n          font: inherit; }\n@media -sass-debug-info{filename{font-family:file\\:\\/\\/\\/Users\\/ich\\/dev\\/isso\\/isso\\/css\\/bourbon\\/css3\\/_placeholder\\.scss}line{font-family:\\000038}}\n          .postbox > .form-wrapper > .auth-section .input-wrapper input::-webkit-input-placeholder {\n            color: #AAA; }\n@media -sass-debug-info{filename{font-family:file\\:\\/\\/\\/Users\\/ich\\/dev\\/isso\\/isso\\/css\\/bourbon\\/css3\\/_placeholder\\.scss}line{font-family:\\0000314}}\n          .postbox > .form-wrapper > .auth-section .input-wrapper input:-moz-placeholder {\n            color: #AAA; }\n@media -sass-debug-info{filename{font-family:file\\:\\/\\/\\/Users\\/ich\\/dev\\/isso\\/isso\\/css\\/bourbon\\/css3\\/_placeholder\\.scss}line{font-family:\\0000319}}\n          .postbox > .form-wrapper > .auth-section .input-wrapper input::-moz-placeholder {\n            color: #AAA; }\n@media -sass-debug-info{filename{font-family:file\\:\\/\\/\\/Users\\/ich\\/dev\\/isso\\/isso\\/css\\/bourbon\\/css3\\/_placeholder\\.scss}line{font-family:\\0000324}}\n          .postbox > .form-wrapper > .auth-section .input-wrapper input:-ms-input-placeholder {\n            color: #AAA; }\n@media -sass-debug-info{filename{font-family:file\\:\\/\\/\\/Users\\/ich\\/dev\\/isso\\/isso\\/css\\/isso\\.scss}line{font-family:\\00003193}}\n      .postbox > .form-wrapper > .auth-section .post-action {\n        display: block;\n        float: left;\n        margin-right: 5.85151%;\n        width: 15.3188%;\n        margin-top: 0.1em; }\n@media -sass-debug-info{filename{font-family:file\\:\\/\\/\\/Users\\/ich\\/dev\\/isso\\/isso\\/css\\/neat\\/grid\\/_span-columns\\.scss}line{font-family:\\0000333}}\n        .postbox > .form-wrapper > .auth-section .post-action:last-child {\n          margin-right: 0; }\n@media -sass-debug-info{filename{font-family:file\\:\\/\\/\\/Users\\/ich\\/dev\\/isso\\/isso\\/css\\/isso\\.scss}line{font-family:\\00003197}}\n        .postbox > .form-wrapper > .auth-section .post-action > input {\n          width: 100%;\n          padding: 0.4em 1em;\n          border-radius: 2px;\n          border: #CCC solid 1px;\n          background-color: #DDD;\n          cursor: pointer; }\n@media -sass-debug-info{filename{font-family:file\\:\\/\\/\\/Users\\/ich\\/dev\\/isso\\/isso\\/css\\/isso\\.scss}line{font-family:\\00003207}}\n          .postbox > .form-wrapper > .auth-section .post-action > input:hover {\n            background-color: #CCC; }\n@media -sass-debug-info{filename{font-family:file\\:\\/\\/\\/Users\\/ich\\/dev\\/isso\\/isso\\/css\\/isso\\.scss}line{font-family:\\00003211}}\n          .postbox > .form-wrapper > .auth-section .post-action > input:active {\n            background-color: #BBB; }\n';});

define('app/text/css',["text!../../../css/isso.css"], function(isso) {
    return {
        inline: isso
    };
});

/*
 * Copyright 2013, Martin Zimmermann <info@posativ.org>. All rights reserved.
 * Distributed under the MIT license
 */

require(["ready", "app/config", "app/api", "app/isso", "app/count", "app/dom", "app/markup", "app/text/css"], function(domready, config, api, isso, count, $, Mark, css) {

    

    domready(function() {

        if (config["css"]) {
            var style = $.new("style");
            style.type = "text/css";
            style.textContent = css.inline;
            $("head").append(style);
        }

        count();

        if ($("#isso-thread") === null) {
            return console.log("abort, #isso-thread is missing");
        }

        $("#isso-thread").append($.new('h4'));
        $("#isso-thread").append(new isso.Postbox(null));
        $("#isso-thread").append('<div id="isso-root"></div>');

        api.fetch($("#isso-thread").getAttribute("data-isso-id")).then(function(rv) {

            if (! rv.length) {
                $("#isso-thread > h4").textContent = Mark.up("{{ i18n-no-comments }}");
                return;
            }

            $("#isso-thread > h4").textContent = Mark.up("{{ i18n-num-comments | pluralize : `n` }}", {n: rv.length});
            for (var i=0; i < rv.length; i++) {
                isso.insert(rv[i], false);
            }
        }).fail(function(err) {
            console.log(err);
        }).done(function() {
            if (window.location.hash.length > 0) {
                $(window.location.hash).scrollIntoView();
            }
        });
    });
});

define("embed", function(){});
}());