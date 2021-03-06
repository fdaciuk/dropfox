import Emitter from 'wildemitter';
import { debounce } from 'decko';
import { Client, AuthDriver } from 'dropbox';
import remote from 'remote';

const request = remote.require('request');
const fs = remote.require('fs');
const tmp = remote.require('tmp');
const shell = remote.require('shell');

const dropbox = new Client({
	key: API_KEY
});

const CLEANUPS = {};

const NOOP = ()=>{};

export default dropbox;

Object.assign(dropbox, new Emitter());
Object.assign(dropbox, Emitter.prototype);

dropbox.authDriver(new AuthDriver.Popup({
	receiverUrl: 'https://dropfox.firebaseapp.com/dropbox/oauth_receiver.html'
	//receiverUrl: location.href.replace(/[^/]+$/,'') + 'assets/oauth_receiver.html'
}));

export function init(callback=NOOP) {
	dropbox.authenticate({ interactive: false }, err => {
		if (err) return callback(err);

		if (dropbox.isAuthenticated()) {
			dropbox.emit('init');
			return callback();
		}

		dropbox.authenticate( err => {
			if (err) return callback(err);

			dropbox.emit('init');
			callback();
		});
	});
}

export function stream(path, callback) {
	path = path.replace(/^\//,'');
	let url = `${dropbox._urls.getFile}/${path}?access_token=${dropbox.credentials().token}`,
		basename = (path.match(/([^\/]+)\/?$/g) || [])[0] || '',
		error, localPath,
		done = debounce(() => callback ? callback(error, localPath) : (callback = null));
	tmp.dir( (err, target, fd, cleanup) => {
		localPath = target + '/' + basename;
		CLEANUPS[localPath] = cleanup;
		request.get(url)
			.on('error', err => { error = err; done(); })
			.pipe(
				fs.createWriteStream(localPath)
					.on('error', err => { error = err; done(); })
					.on('finish', done)
			);
	});
}

export function open(path, options, callback) {
	if (typeof options==='function') {
		[callback, options] = [options, callback];
	}
	options = options || {};
	stream(path, (err, localPath) => {
		if (!err) {
			shell.openItem(localPath);

			if (options.autoSync) {
				watchAndUpload(localPath, path, options.onSync || options.onUpload);
			}
		}
		callback(err, localPath);
	});
}


function watchAndUpload(localPath, path, onUpload) {
	fs.watch(localPath, debounce(1000, changeType => {
		console.log('changed', changeType, localPath);

		upload(localPath, path, onUpload);
	}));
}


const backend = remote.require('../../electron/backend');
export function upload(localPath, path, callback) {
	let url = `${dropbox._urls.putFile}/${path}?access_token=${dropbox.credentials().token}`;
	backend.upload(localPath, url, err => {
		callback(err);
	});
}


Object.assign(dropbox, { init, stream, open, upload });

// console.log(window.dropbox = dropbox);
