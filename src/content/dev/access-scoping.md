---
title: Region-to-building access scoping
summary: Every staff account sees exactly the regions and buildings it is assigned to, enforced in the data layer rather than the UI.
parent: htd-platform
role: Architecture
stack: [Laravel, Policies, MySQL]
status: Live
order: 1
draft: true
---

Operators, drivers and building staff all work in the same system but must only see their own slice of it. Access is scoped from region down to building and applied where the data is queried, so a new screen cannot accidentally leak another building's packages.
