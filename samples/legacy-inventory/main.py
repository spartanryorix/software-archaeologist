# -*- coding: utf-8 -*-
# Warehouse inventory report generator -- written 2014 for Python 2.7
import csv
import os
from jinja2 import Template

TEMPLATE = Template(u"""Inventory report
================
{% for r in rows %}{{ "%-14s" % r.name }} qty={{ "%5d" % r.qty }}  value=${{ "%10.2f" % r.value }}
{% endfor %}----------------
Total value: ${{ "%.2f" % total }}
""")


class Row(object):
    def __init__(self, name, qty, price):
        self.name = name
        self.qty = int(qty)
        self.price = float(price)
        self.value = self.qty * self.price


def load(path):
    rows = []
    with open(path, "rb") as f:
        for rec in csv.DictReader(f):
            rows.append(Row(rec["item"], rec["qty"], rec["price"]))
    return rows


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    rows = load(os.path.join(here, "data", "inventory.csv"))
    total = sum(r.value for r in rows)
    print TEMPLATE.render(rows=rows, total=total)
    print "report generated for %d items" % len(rows)
