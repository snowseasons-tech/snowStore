# Roadside Delay Planner concept demo

Open [demo.html](demo.html) or [try it on the store](https://snowseasonstech.store/demos/roadside-delay-planner.html).

Adjust a fictional site's queue, service time, lane count, and active period. See how those assumptions change three sample ETAs and appointment times, then prepare a receiver-message preview.

This is a research concept, not a live delay service. Every affected truck is assumed to stop. Estimated wait plus stop is `(floor(vehicles ahead / lanes) + 1) * inspection minutes`, with balanced lanes, constant service time, and an independent queue scenario for each truck. It uses no live inspection, traffic, GPS, routing, or receiver data and sends no notifications.
