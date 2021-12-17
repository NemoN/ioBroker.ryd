"use strict";

/*
 * Created with @iobroker/create-adapter v1.15.1
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");

// Custom modules
const uuid = require('uuid/v4');
// const util = require('util');
const http_request = require('request-promise-native');

// for debug url and randomness
const debug = false;


class Ryd extends utils.Adapter {

	/**
	 * @param {Partial<ioBroker.AdapterOptions>} [options={}]
	 */
	constructor(options) {
		super({
			...options,
			name: "ryd",
		});

		this.on("ready", this.onReady.bind(this));
		this.on("unload", this.onUnload.bind(this));

		this._shutdown = false;
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		// config
		this._adapter_randomness = Math.floor(Math.random() * 60000 + 1); // add max 60 seconds randomness
		this._adapter_timeout = parseInt(this.config.adapterTimeout, 10) || 10000;
		this._adapter_delay = 10 * 60 * 1000; // in ms

		// fallback
		setTimeout(() => {
			this.log.error("Adapter timeout reached. Stopping adapter now.");
			this.stop(); // stop adapter right here (on schedule mode)
		}, this._adapter_timeout + this._adapter_randomness);

		this._think_properties = this.config.thinkProperties.split(',');
		this._think_properties_ignore = this.config.thinkPropertiesIgnore.split(',');

		if (!this.config.email) {
			this.log.info("Setup missing: Email is empty. Stopping adapter now.");
			this.stop();
			return false;
		} else if (!this.config.password) {
			this.log.info("Setup missing: Password empty. Stopping adapter now.");
			this.stop();
			return false;
		}

		this._ryd_api_server = this.config.rydApiServer;
		if(debug){
			this._ryd_api_server = 'http://www.nemon.org/ryd'; // DEBUG
		}

		this._client_device_type = this.config.clientDeviceType;
		this._client_device_id = this.config.clientDeviceId;
		this._client_device_version = this.config.clientDeviceVersion;
		this._client_device_resolution = this.config.clientDeviceResolution;

		this._ryd_app_version = this.config.rydAppVersion;
		this._ryd_app_locale = this.config.rydAppLocale;
		this._ryd_app_platform = this._client_device_type + ' [' + this._client_device_id + ',' + this._client_device_version + ',' + this._client_device_resolution + ']';
		this._ryd_app_user_agent = this.config.rydAppInternalName + '/' + this._ryd_app_version + '(' + this._client_device_id + '; ' + this._client_device_type + ' ' + this._client_device_version + ')';

		try {
			this._ryd_auth_token = (await this.getStateAsync('authToken')).val;
			this._ryd_things = JSON.parse((await this.getStateAsync('rydThings')).val);
		} catch (error) {
			// do not stop adapter, will be resolved with login
			this._resetUserStates();
			this.log.debug("read user states:" + error);
		}

		this._base_request = http_request.defaults({
		    gzip: true,
			timeout: 2000,
		    headers: {
		        'x-txn-platform': this._ryd_app_platform,
		        'Cache-Control': 'no-cache, no-store, must-revalidate',
		        'Pragma': 'no-cache',
		        'Expires': 0,
		        'x-txn-app-version': this._ryd_app_version,
		        'User-agent': this._ryd_app_user_agent,
		        'X-Txn-Request-Id': uuid(),
		        'X-Txn-Locale': this._ryd_app_locale,
		        'Content-Type': 'application/json; charset=utf-8'
		    }
		})

		this.log.info("Account: " + this.config.email);
		this.log.debug("Adapter timeout: " + this._adapter_timeout + " ms");
		this.log.debug("Think properties: " + this._think_properties);
		this.log.debug("Think properties ignore: " + this._think_properties_ignore);

		try {
			const state = await this.getStateAsync('lastUpdate');
			const now = new Date().getTime();
/*
			if (now < (state.ts + this._adapter_delay)) {
				this.log.info("Adapter ran less than " + (this._adapter_delay/1000) + " seconds earlier. Try it again later.");
				this.stop(); // stop adapter right here (on schedule mode)
				return false;
			}
*/
		} catch (e) {
			// handle error here
		}

		await this._createUserStates();

		this._queryRydServer();
	}

	async _createUserStates() {
		await this.setObjectNotExistsAsync("authToken", {
			type: "state",
			common: {
				name: "authToken",
				type: "string",
				role: "value",
				read: true,
				write: true,
			},
			native: {},
		});

		await this.setObjectNotExistsAsync("rydThings", {
			type: "state",
			common: {
				name: "rydThings",
				type: "json",
				role: "value",
				read: true,
				write: true,
			},
			native: {},
		});

		await this.setObjectNotExistsAsync("lastUpdate", {
			type: "state",
			common: {
				name: "lastUpdate",
				type: "number",
				role: "date",
				read: true,
				write: true,
			},
			native: {},
		});
	}

	async _loginRydServer() {
		this.log.debug("Trying to (re) log in");
		try {
			let response = await this._base_request({
				method: 'POST',
				// url: this._ryd_api_server + '/auth%2Flogin%2Flocal',
				url: this._ryd_api_server + '/auth/login/local',
				body: JSON.stringify({
					email: this.config.email,
					password: this.config.password
				})
			});

			var userObj = JSON.parse(response);
		} catch (error) {
			await this._rydServerError(error);
			return false;
		}

		this.log.debug("Login successful");

		try {
			this._ryd_auth_token = userObj.auth_token;
			this._ryd_things = userObj.things;

			this.log.debug("login: auth token: "+userObj.auth_token.substr(0,5) +", things: "+JSON.stringify(this._ryd_things),);

			await this.setStateAsync("authToken", this._ryd_auth_token, true);
			await this.setStateAsync("rydThings", JSON.stringify(this._ryd_things), true);

			return true;
		} catch (error) {
			this._resetUserStates();
			this._rydInternalError(error);
			return false;
		}
	}

	/**
	 * _queryRydServer
	 */
	async _queryRydServer() {
		if(!debug){
			this.log.debug("Adapter will wait " + this._adapter_randomness + " ms (to distribute server load)");
			await this._sleep(this._adapter_randomness);
		}

		if ((this._ryd_auth_token == null || !(typeof this._ryd_auth_token == "string") || this._ryd_auth_token === "")
			|| (this._ryd_things == null || this._ryd_things == undefined))
		{
			this.log.info("No auth token or things, triggering login");
			await this._loginRydServer();
		} else {
			this.log.debug("Auth token and things present, continuing");
		}

		this.log.debug("_queryRydServer: auth token: " + this._ryd_auth_token.substr(0,5) + ", things:" + JSON.stringify(this._ryd_things));

		// -- DEBUG
/*
		this._ryd_things = [
			{"id":"1","role":"THING_OWNER","type":"CAR"},
			{"id":"2","role":"THING_OWNER","type":"CAR"},
			{"id":"3","role":"THING_OWNER","type":"CAR"}
		];
*/

		this.log.debug('Things('+ this._ryd_things.length + '): ' + JSON.stringify(this._ryd_things));

		let things_obj = [];
		await Promise.all(this._ryd_things.map(async thing => {
			let response = await this._base_request({
				url: this._ryd_api_server + '/things/' + thing.id + '/status?auth_token=' + this._ryd_auth_token
			});

			let thing_obj = JSON.parse(response);
			things_obj[thing.id] = thing_obj.data;
		})).then(() => {
			this._createThings(things_obj).then(() => {
				this.setStateAsync("lastUpdate", new Date());
				/**
				try {
					let response = this._base_request({
						url: this._ryd_api_server + '/auth%2Flogout?auth_token=' + this._ryd_auth_token
					});
					this.log.debug("Done. Logout User.");
					// this.log.debug(util.inspect(response));
				} catch (error) {
					this._rydServerError(error);
				}
				*/

				this.stop(); // stop adapter right here (on shedule mode)
			}).catch((error) => {
				this._rydInternalError(error);
			});
		}).catch((error) => {
			this._rydInternalError(error);
		});
	}

	/**
	 * _createThings
	 */
	async _createThings(things_obj) {
		for (let id in things_obj) {
			// console.log("=== id " + id + " ===");
			// console.log(things_obj[id]);
			let thing_obj = things_obj[id];

			for (let p in thing_obj) {
				if (typeof thing_obj[p] !== 'object') {
					// console.log('create things.' + id + '.' + p);
					await this.setObjectNotExistsAsync('things.' + id + '.' + p, {
						type: 'state',
						common: {
							'name': p,
							'role': 'state',
							'type': typeof thing_obj[p],
							'write': false,
							'read': true
						},
						native: {}
					});

					await this.setState('things.' + id + '.' + p, {val : thing_obj[p], ack : true});
				} else {
					let sub_thing_obj = thing_obj[p];
					if (this._think_properties.includes(p)) {
						for (let q in sub_thing_obj) {
							// console.log("+ " + q);
							await this.setObjectNotExistsAsync('things.' + id + '.' + p + '.' + q, {
								type: 'state',
								common: {
									'name': p,
									'role': 'state',
									'type': typeof sub_thing_obj[q],
									'write': false,
									'read': true
								},
								native: {}
							});

							let value = (typeof sub_thing_obj[q] == 'object') ? JSON.stringify(sub_thing_obj[q]) : sub_thing_obj[q];
							await this.setState('things.' + id + '.' + p + '.' + q, {val : value, ack : true});
						}
					} else {
						if (!this._think_properties_ignore.includes(p)) {
							this.log.debug('Unknown property: things.' + id + '.' + p);
							this.log.debug(JSON.stringify(thing_obj[p]));
						}
					}
				}
			}
		}
	}

	async _sleep(ms) {
		return new Promise(resolve => setTimeout(() => resolve(), ms));
	}

	/**
	 * _rydServerError
	 */
	async _rydServerError(error) {
		// console.log(error);
		this.log.error('request (' + error.options.url + ') failed ' + error.name + ' (' + error.statusCode + ')');

		if (error.statusCode == 401) {
			this.log.error("Access denied. Please check Ryd username and password! Trying to login again next time");
			await this._resetUserStates();
		}

		this.stop(); // stop adapter right here (on schedule mode)
	}

	/**
	 * _rydInternalError
	 */
	_rydInternalError(error) {
		// console.log(error);
		this.log.error(error);
		this.stop(); // stop adapter right here (on schedule mode)
	}

	/**
	 * _resetUserStates
	 */
	async _resetUserStates() {
		this.log.debug("resetting authToken and rydThings");
		await this.setStateAsync("authToken", "", true);
		await this.setStateAsync("rydThings", "", true);
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		if (!this._shutdown) {
			try {
				this.log.debug(this.name + " stopped, cleaned everything up...");
				this._shutdown = true;
				clearTimeout();
				callback();
			} catch (e) {
				callback();
			}
		}
	}
}

// @ts-ignore parent is a valid property on module
if (module.parent) {
	// Export the constructor in compact mode
	/**
	 * @param {Partial<ioBroker.AdapterOptions>} [options={}]
	 */
	module.exports = (options) => new Ryd(options);
} else {
	// otherwise start the instance directly
	new Ryd();
}
