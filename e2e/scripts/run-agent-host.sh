#!/bin/bash
cd /home/agjrom/websites/meet-poc
exec xvfb-run -a node e2e/scripts/persistent-agent-host.mjs
