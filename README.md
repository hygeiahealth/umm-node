# umm

NodeJS implementation of the UMM (Useful Monitoring and Management) standard protocol.

## Requires

1. log4js

## Methods


### Init(Options)

Initializes UMM. `Options` should be an object that looks like this:

```
{
	connectHeaders: {  // authentication credentials for RabbitMQ
		login: <string>,
		passcode: <string>
	},
	Server: <string>,  // the display name of this server
	Host: <string>,  // the FQDN of this server
	User: <string>, // optional, the Brightree username in use
	Log: <string>,  // optional, filename of a local log file to write
	Debug: <boolean>,  // optional, defaults to false, will copy log lines to STDOUT
	EFSRoot: <string>, // optional, defaults to /hygeia-efs-1/logs/UMM/, the folder to write UMM session logs
	PID: <integer>,  // optional, the PID to report to UMM, defaults to the NodeJS process PID
	Port: <integer>, // optional, the TCP port to run the HTTP server on, defaults to a random port between 10000-60000
	SessionID: <string>,  // optional, defaults to <hires-time_t-PID>
}

```

