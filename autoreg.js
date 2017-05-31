const RegRPC = require('regrpccli');

function Autoreg(...con_args) {
	let con = null;
	let timer = null;
	const close = () => {
		clearTimeout(timer);
		timer = null;
		if (con) {
			try {
				con.close();
			} finally {
				con = null;
			}
		}
	};
	const reconnect = () => {
		close();
		RegRPC.create(...con_args)
			.then(_con => {
				con = _con;
				console.info('Connection to relay server established');
			})
			.catch(err => {
				console.error('Failed to connect to relay server');
				console.error(err);
				close();
				if (!timer) {
					timer = setTimeout(reconnect, 1000);
				}
			});
	};
	const set = (...args) => {
		if (!con) {
			return;
		}
		con.set(...args)
			.catch(err => {
				console.error('Failed to send regrpc command');
				console.error(err && err.stack);
				console.info('Reconnecting');
				reconnect();
			});
	};
	this.set = set;
	this.close = close;
	reconnect();
}

module.exports = Autoreg;
