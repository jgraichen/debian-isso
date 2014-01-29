# debian-isso

Debian package for [isso comments server](https://github.com/posativ/isso/).

## Quick build

First you need to install `dpkg-dev` package.

Then do quickly a build for your own use (produce only unsigned binary package for your arch):

    $ dpkg-buildpackage -rfakeroot -uc -b

You should then have the resulting package in parent directory.

## Long build

Requires setup [sbuild](https://wiki.debian.org/sbuild).

First build source package:

```
    $ dpkg-source -b isso
```

Then build package in minimal chrooted build environment:

```
    $ sbuild -A ../isso_<version>.dsc
```

## Maintainer

Update upstream source (from pypi releases):

```
    $ gbp import-orig --uscan
```

### TODO's

* Test package on ubuntu(s)
* Test systemd script
* Add upstart script

