# umm

NodeJS implementation of the UMM (Useful Monitoring and Management) standard protocol.

## Requires

1. log4js
2. axios
3. ws
4. text-encoding
5. read-last-lines
6. @stomp/stompjs


## Synopsis

TODO

## UMM Standard Structure

```
{
	SessionID: <string>,
	SessionType: <string>,
	Server: <string>,
	Host: <string>,
	PID: <integer>,
	Script: <string>,
	Port: <integer>,
	User: <string>,

	TotalRecords: null,
	CompletedRecords: null,
	SkippedRecords: null,
	StartDt: <bigint>,
	LastUpdate: <bigint>,
	PercentComplete: <double>,

	RecordType: <string>,
	RecordID: <string>,
	Module: <string>,
	Step: <string>,
	Status: <string>
}
```


## Methods


### async Init(object Options)

Initializes UMM. `Options` should be an object that looks like this:

```
{
	brokerURL: <string>, // full URL to the RabbitMQ broker
	connectHeaders: {  // authentication credentials for RabbitMQ
		login: <string>,
		passcode: <string>
	},
	ResultsAPI: <string>, // full URL to the result API
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

### DW(object Client)

Sets the active MySQL client handle to the Data Warehouse. Expects a client
instance object of the NodeJS `mysql` module.


### async Update(object Payload)

Updates the UMM `Status` object and sends the new status via RabbitMQ.

Valid object properties are any fields in the standard Status structure.

TODO: discuss mechanics of setting `RecordID`, `Module` and `Step`.

### async StompSend(string Topic, object Payload)

Sends the specified `Payload` object to the specified RabbitMQ `Topic`.

### SetPage(object Page)

Sets the active `Puppeteer` Page object.

### ShouldExit()

Returns a boolean indicating if the current UMM session has been asked to
cleanly terminate.

### async Result(string Result, boolean IsError)

Ends the UMM session. An `Exit` message is broadcasted and a new record is
inserted into the  `UMMResult` table. That last action is performed directly
with the specified DW handle, or via HTTPS if the handle is not set.

Note that this method does *not* exit the NodeJS process.
