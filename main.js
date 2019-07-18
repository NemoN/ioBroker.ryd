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
			this.log.error("adapter timeout reached. Stopping adapter now.");
			this.stop(); // stop adapter right here (on schedule mode)
		}, this._adapter_timeout + this._adapter_randomness);

		this._think_properties = this.config.thinkProperties.split(',');
		this._think_properties_ignore = this.config.thinkPropertiesIgnore.split(',');

		if (!this.config.email) {
			this.log.info("setup missing: email is empty. stopping adapter now.");
			this.stop();
			return false;
		} else if (!this.config.password) {
			this.log.info("setup missing: password empty. stopping adapter now.");
			this.stop();
			return false;
		}

		this._ryd_api_server = this.config.rydApiServer;
		// this._ryd_api_server = 'http://www.nemon.org/ryd'; // DEBUG

		this._client_device_type = this.config.clientDeviceType;
		this._client_device_id = this.config.clientDeviceId;
		this._client_device_version = this.config.clientDeviceVersion;
		this._client_device_resolution = this.config.clientDeviceResolution;

		this._ryd_app_version = this.config.rydAppVersion;
		this._ryd_app_locale = this.config.rydAppLocale;
		this._ryd_app_platform = this._client_device_type + ' [' + this._client_device_id + ',' + this._client_device_version + ',' + this._client_device_resolution + ']';
		this._ryd_app_user_agent = this.config.rydAppInternalName + '/' + this._ryd_app_version + '(' + this._client_device_id + '; ' + this._client_device_type + ' ' + this._client_device_version + ')';

		this._ryd_auth_token = '';
		this._ryd_things = [ {} ];

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

		this.log.info("account: " + this.config.email);
		this.log.debug("adapter timeout: " + this._adapter_timeout + " ms");
		this.log.debug("think properties: " + this._think_properties);
		this.log.debug("think properties ignore: " + this._think_properties_ignore);

		try {
			const state = await this.getStateAsync('lastUpdate');
			const now = new Date().getTime();

			if (now < (state.ts + this._adapter_delay)) {
				this.log.info("adapter ran less than " + (this._adapter_delay/1000) + " seconds earlier. trying again later.");
				this.stop(); // stop adapter right here (on schedule mode)
				return false;
			}
		} catch (e) {
			// handle error here
		}

		this._queryRydServer();
	}

	/**
	 * _queryRydServer
	 */
	async _queryRydServer() {
		this.log.debug("adapter will wait " + this._adapter_randomness + " ms (to spread server load)");
		await this._sleep(this._adapter_randomness);

		try {
			let response = await this._base_request({
				method: 'POST',
				url: this._ryd_api_server + '/auth%2Flogin%2Flocal',
				body: JSON.stringify({
					email: this.config.email,
					password: this.config.password
				})
			});

			var userObj = JSON.parse(response);
		} catch (error) {
			this._rydServerError(error);
		}

		try {
			this._ryd_auth_token = userObj.auth_token;
			this._ryd_things = userObj.things;
		} catch (error) {
			this._rydInternalError(error);
		}

		// -- DEBUG
/*
		this._ryd_things = [
			{"id":"1","role":"THING_OWNER","type":"CAR"},
			{"id":"2","role":"THING_OWNER","type":"CAR"},
			{"id":"3","role":"THING_OWNER","type":"CAR"}
		];
*/
		// this.log.debug(userObj);
		this.log.debug('user token: ' + this._ryd_auth_token);
		this.log.debug('things('+ this._ryd_things.length + '): ' + JSON.stringify(this._ryd_things));

		let things_obj = [];
		await Promise.all(this._ryd_things.map(async thing => {
			let response = await this._base_request({
				url: this._ryd_api_server + '/things/' + thing.id + '/status?auth_token=' + this._ryd_auth_token
			});

			let thing_obj = JSON.parse(response);
			things_obj[thing.id] = thing_obj.data;
		})).then(() => {
			this._createThings(things_obj).then(() => {
				// update lastUpdate
				this.setObjectNotExistsAsync("lastUpdate", {
					type: "state",
					common: {
						name: "lastUpdate",
						type: "number",
						role: "date",
						read: true,
						write: false,
					},
					native: {},
				}).then(() => {
					this.setStateAsync("lastUpdate", new Date());
					this.stop(); // stop adapter right here (on shedule mode)
				}).catch((error) => {
					this._rydInternalError(error);
				});

			}).catch((error) => {
				this._rydInternalError(error);
			});
		}).catch((error) => {
			this._rydServerError(error);
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
	_rydServerError(error) {
		// console.log(error);
		this.log.error('request (' + error.options.url + ') failed ' + error.name + ' (' + error.statusCode + ')');

		if (error.statusCode == 401) {
			this.log.error("access denied. please check Ryd username and password!");
		}

		this.stop(); // stop adapter right here (on shedule mode)
	}

	/**
	 * _rydServerError
	 */
	_rydInternalError(error) {
		// console.log(error);
		this.log.error(error);
		this.stop(); // stop adapter right here (on shedule mode)
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
