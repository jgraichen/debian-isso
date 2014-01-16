debian-isso
===========

Debian packae for [isso comments server](https://github.com/posativ/isso/).

Quick build
------------

First you need to install `dpkg-dev` package.

Then do quickly a build for your own use (produce only unsigned binary package for your arch) :

    $ dpkg-buildpackage -rfakeroot -uc -b
    
You should then have the resulting package in parent directory.
