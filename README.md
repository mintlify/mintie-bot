## General Implementation Notes

- Simple handler/operator pattern
- Base listeners for app_mention and message events are in index.ts
- Events are handled by the handler's which call the operator's approriate methods
- Operators are responsible for the business logic of the app
- Utils contain basic utility functions like converting from to slack markdown format
- Internal debugging and console logging is done using the logging.ts file

- use the `/slack/events` with `tmole` port forwarding to localhost:3000
