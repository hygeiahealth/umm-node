/*
	UMM - Useful Monitoring and Management
	Standard protocol
	NodeJS implementation
	2020-07-15 gbk
*/

const StompJs = require('@stomp/stompjs');
const CHANNEL = '/topic/uia-status';
var EFS = '/hygeia-efs-1/logs/UMM/';
const process = require('process');
const path = require('path');
const axios = require('axios');
const readLastLines = require('read-last-lines');

Object.assign(global, { WebSocket: require('ws') });
const TextEncodingPolyfill = require('text-encoding');
TextEncoder = TextEncodingPolyfill.TextEncoder;
TextDecoder = TextEncodingPolyfill.TextDecoder;

var CLIENT;

// initialize the status structure
var Status = {
	SessionID: '',
	SessionType: 'NodeJS',
	Server: '',
	Host: '',
	PID: null,
	Script: path.basename(process.argv[1]),
	Port: null,
	User: 'None',

	TotalRecords: null,
	CompletedRecords: null,
	SkippedRecords: null,
	StartDt: (new Date()).valueOf(),
	LastUpdate: (new Date()).valueOf(),
	PercentComplete: null,

	RecordType: '',
	RecordID: null,
	Module: '',
	Step: '',
	Status: ''
};

const log4js = require('log4js');
const logger = log4js.getLogger('UMM');

const http = require('http');
var SERVER;
const fs = require('fs');

function Serialize(Obj) {
	return JSON.stringify(Obj);
}
function defined(val) {
	if(typeof(val) == 'undefined') return false;
	if(val == null) return false;
	return true;
}

function StompStart() {
	CLIENT.activate();
}
function StompStop() {
	CLIENT.deactivate();
}
async function StompSend(Topic,Payload) {
	try {
		CLIENT.publish({destination: Topic, body: Serialize(Payload)});
	} catch(e) {
		logger.error(e);
	}
}

var PAGE = null;
function SetPage(Page) {
	PAGE = Page;
}
var LastCommand = null; 
var SHOULDEXIT = false;
function ShouldExit() {
	return SHOULDEXIT;
}

var ONTERMINATE = async function(){};
function onTerminate(callback) {
	onTerminate = callback;
}

//Warehouse connection object for logging
var DWClient = null;
function DW(Client) {
	DWClient = Client;
}

// computed location of the UMM log file
var UMMLogFile = null;

async function StartServer() {
	SERVER = http.createServer(async (req,res) => {
		// handle requests

		const { method, url } = req;

		logger.debug(`${method} ${url}`);

		if(url == '/favicon.ico') {
			var fc = fs.readFileSync(__dirname+'/static/favicon.ico');
			res.writeHead(200, { 'Content-Type': 'image/x-icon' });
			res.end(fc);

		} else if(url == '/screenshot.png') {

			if(PAGE == null) {
				logger.debug('no PAGE attached');
				var fc = fs.readFileSync(__dirname+'/static/no-page.png');
				res.writeHead(200, { 'Content-Type': 'image/png' });
				res.end(fc);
				return;
			}

			var png = await PAGE.screenshot({fullPage: true});
			res.writeHead(200, { 'Content-Type': 'image/png' });
			res.end(png);

			logger.debug('responded with screenshot');

		// TODO: support JPG and PDF screenshots here


		} else if(url == '/session-log.txt') {
			var LogLines = fs.readFileSync(UMMLogFile);
			res.writeHead(200, { 'Content-Type': 'text/plain' });
			res.end(LogLines);

		} else if(url == '/session-log-100.txt') {

			res.writeHead(200, { 'Content-Type': 'text/plain' });
			var lines = await readLastLines.read(UMMLogFile,100);
			res.end(lines);

		} else {
			res.writeHead(200, { 'Content-Type': 'text/html' });
			res.end('<html><title>Not found.</title><h1>Requested object not found.</h1></html>');
		}

	});
	SERVER.listen(Status.Port);
}

async function Init(Options) {
	/*
		Options should be:
		{
			connectHeaders: {  // for the RabbitMQ connection
				login
				passcode
			}
			Server
			Host
			User

			Log  // optional; if you want a local log
			Debug  // set to false to disable console logging
		}
	*/

	if(Options.hasOwnProperty('EFSRoot')) {
		EFS = Options.EFSRoot;
	}


	Status.Server = Options.Server;
	Status.Host = Options.Host;
	Status.User = Options.User;
	if(Options.hasOwnProperty('Script')) Status.Script = Options.Script
	
	if(Options.hasOwnProperty('PID')) {
		Status.PID = Options.PID;
	} else {
		Status.PID = process.pid;
	}

	if(Options.hasOwnProperty('SessionID')) {
		Status.SessionID = Options.SessionID;
	} else {
		var d = new Date();
		Status.SessionID = d.valueOf() + '-' + Status.PID;
	}
	if(Options.hasOwnProperty('Port')) {
		Status.Port = Options.Port;
	} else {
		Status.Port = 10000+parseInt(Math.random()*50000)
	}

	UMMLogFile = `${EFS}/logs/UMM/${Status.SessionID}`;
	// configure the logs
	var Appenders = {
		// default to just the UMM session log
		UMM: { type: 'file', filename: UMMLogFile}
	};

	// if a local log was specified, configure it
	if(Options.hasOwnProperty('Log')) {
		Appenders.Log = {type: 'file', filename: Options.Log};
	}
	// and add the console output unless it's been turned off
	if(!Options.hasOwnProperty('Debug') || Options.Debug == true) {
		Appenders.Console = {type: 'stdout', level: 'debug'};
	}

	// apply the config
	log4js.configure({
		appenders: Appenders,
		categories: {
			default: {appenders: Object.keys(Appenders), level: 'debug'}
		}
	});

	// start the HTTP server
	await StartServer();

	return new Promise(function(resolve,reject) {

		logger.debug('creating client');

		CLIENT = new StompJs.Client({
			brokerURL: 'wss://mq.hygeiahealth.com:15671/ws',
			connectHeaders: Options.connectHeaders,
			reconnectDelay: Options.reconnectDelay||500,
			heartbeatIncoming: Options.heartbeatIncoming||4000,
			heartbeatOutgoing: Options.heartbeatOutgoing||4000,

			// debug: function(str) {
			// 	logger.debug(str);
			// },
			onConnect: function(frame) {
				logger.debug('Connected');
				Update({});
				CLIENT.subscribe('/topic/uia-control', async function(msg) {
					var data = JSON.parse(msg.body);
					if(data.Command == 'ping') {
						StompSend(CHANNEL, Status);
						return;
					}
					if(data.SessionID != Status.SessionID) return;

					logger.info(msg.body);
					LastCommand = data.Command;

					if(data.Command == 'exit') {
						SHOULDEXIT = true;
					} else if(data.Command == 'kill') {
						await onTerminate();
						await Update({
							type: 'exit',
							result: 'UMM commanded me to terminate',
							isError: false
						})
						process.exit();
					}
				});
				resolve();
			},
			onStompError: function(frame) {
				logger.error('Broker reported error: ' + frame.headers['message']);
				logger.error('Additional details: ' + frame.body);
			},
			onWebSocketError: function(event) {
				logger.debug(Serialize(event));
			}
		});

		logger.debug('activating');

		CLIENT.activate();

	});
}



async function Update(payload) {

	// standard status update logic
	if(defined(payload.RecordID)) {
		Status.Module = '';
		Status.Step = '';
		Status.Status = '';
	}
	if(defined(payload.Module)) {
		Status.Step = '';
		Status.Status = '';
	}
	if(defined(payload.Step)) {
		Status.Status = '';
	}

	var z = Object.keys(payload);
	for (var i = 0; i < z.length; i++) {
		Status[z[i]] = payload[z[i]];
	}

	Status.LastUpdate = (new Date).valueOf();
    await StompSend(CHANNEL,Status);
    //console.log(Serialize(Status));
}

async function Result(result,isError) {
	if(typeof(isError) == 'undefined') isError = false;

	var ExitType = 'Normal';
	if(isError==true) {
		ExitType = 'Error';
	} else if(LastCommand == 'exit') {
		ExitType = 'Aborted';
	} else if(LastCommand == 'kill') {
		ExitType = 'Killed';
	}

	// compile the result row
	var UMMResult = {
		SessionID: Status.SessionID,
		SessionType: Status.SessionType,
		Server: Status.Server,
		Script: Status.Script,
		User: Status.User,
		TotalRecords: Status.TotalRecords,
		CompletedRecords: Status.CompletedRecords,
		SkippedRecords: Status.SkippedRecords,
		StartDt: Status.StartDt,
		EndDt: (new Date()).valueOf(),
		ExitType: ExitType,
		Result: result,
		RecordID: Status.RecordID,
		HasShot: 0
	};

	// if we have a Warehouse client
	if(DWClient != null) {
		logger.debug('[DW] logging the result');

		await DWClient.Query('insert into UMMResult (SessionID,SessionType,Server,Script,User,TotalRecords,CompletedRecords,SkippedRecords,StartDt,EndDt,ExitType,Result,RecordID,HasShot) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[
			UMMResult.SessionID,
			UMMResult.SessionType,
			UMMResult.Server,
			UMMResult.Script,
			UMMResult.User,
			UMMResult.TotalRecords || null,
			UMMResult.CompletedRecords || null,
			UMMResult.SkippedRecords || null,
			UMMResult.StartDt,
			UMMResult.EndDt,
			UMMResult.ExitType,
			UMMResult.Result,
			UMMResult.RecordID || null,
			UMMResult.HasShot
		]);
	} else {
		logger.debug('[HTTPS] logging the result');

		try {
			var Res = await axios.get(`https://automation.hygeiahealth.com/api/UMMResult.pl?SessionID=${UMMResult.SessionID}&SessionType=${UMMResult.SessionType}&Server=${UMMResult.Server}&Script=${UMMResult.Script}&User=${UMMResult.User}&TotalRecords=${UMMResult.TotalRecords}&CompletedRecords=${UMMResult.CompletedRecords}&SkippedRecords=${UMMResult.SkippedRecords}&StartDt=${UMMResult.StartDt}&EndDt=${UMMResult.EndDt}&ExitType=${UMMResult.ExitType}&Result=${UMMResult.Result}&RecordID=${UMMResult.RecordID}&HasShot=${UMMResult.HasShot}`);
			logger.debug(`UMMResult.pl: ${JSON.stringify(Res.data)}`);

		} catch(e) {
			logger.error(`UMMResult.pl: ${e}`);
		}
	}

	await Update({
		type: 'exit',
		result: result,
		isError: isError
	});

}

module.exports = {
	Init,
	DW,
	Update,
	StompSend,
	SetPage,
	ShouldExit,
	Result
};
