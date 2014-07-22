#!/bin/sh

curl -i -X POST -H "Content-Type:application/json" -d '{"type":"iphone"}' $1
