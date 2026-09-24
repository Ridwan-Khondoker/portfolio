---
title: Notification reliability
summary: Tracing why some residents never received delivery alerts, and giving them a self-service fix for carrier-level blocks.
parent: htd-platform
role: Investigation & fix
stack: [Laravel, SMS, Email]
status: In progress
order: 6
draft: true
---

Some delivery alerts were being dropped before reaching residents' phones. The fix traces delivery per message and gives residents a way to clear carrier-level blocks without waiting on support.
