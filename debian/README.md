# debian-isso

Debian package for [isso comments server](https://github.com/posativ/isso/).

*N.B. if you want a debian repository with pre-built packages for amd64 arch, please check https://packages.crapouillou.net*

## Quick build

First you need to install `dpkg-dev` package.

    # apt-get install python-all debhelper dpkg-dev

Then do quickly a build for your own use (produce only unsigned binary package for your arch):

    $ dpkg-buildpackage -rfakeroot -uc -b

You should then have the resulting package in parent directory.

## Long build

Requires [sbuild](https://wiki.debian.org/sbuild).

First build source package:

```
    $ dpkg-source -b isso
```

Then build package in minimal chrooted build environment:

```
    $ sbuild -A ../isso_<version>.dsc
```

Or just run `sbuild` source directory:

```
    $ sbuild -A -s .
```

Or build different architecture or distribution (create sbuild schroots first):

```
    $ sbuild --arch=i386 --dist=precise -A --append-to-version=~precise0 isso*dsc
```

See `man sbuild` for available options.

## Maintainer

Update upstream source (from pypi releases):

```
    $ gbp import-orig --uscan
```

### TODO's

* Test package on ubuntu(s)
* Test systemd script
* Add upstart script
