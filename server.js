const express = require('express'); // Web Framework
const app = express();
const mysql = require('mysql');
const cors = require('cors');
const bodyParser = require('body-parser');
const moment = require('moment');

// logging
const fs = require('fs');
const logger = require('morgan');
const path = require('path');
// create a write stream (in append mode)
const accessLogStream = fs.createWriteStream(path.join(__dirname, 'access.log'), { flags: 'a' });

// start app with `DEBUG=app:* node .` to see logs
const debug = require('debug')('app:server');


// mysql connection pool
const pool = mysql.createPool({
  connectionLimit : 10,
  host: process.env.CONN_DEV_HOST,
  user: process.env.CONN_DEV_USER,
  password: process.env.CONN_DEV_PASSWORD,
  database: process.env.CONN_DEV_DB
});



// Express Middleware to verify every request contains a valid
// macAddress and sessionKey combination
const authorizedDevice = function(req, res, next) {
  const macAddress = req.body.macAddress || req.query.macAddress;
  const sessionKey = req.body.sessionKey || req.query.sessionKey;

  const query = 'SELECT auth_key FROM authorized_device WHERE auth_key = ? and session_key = ?';
  const params = [macAddress, sessionKey];
   console.log('params: ', params)

  pool.query(query, params, (error, results, fields) => {
    if (error) {
      console.error(error);
      res.status(500).send('server error\n');
    } else {
      if (results.length === 1) {
        debug(`${macAddress} is authorized`);
        next();
      } else {
        debug(`${macAddress} is denied. Invalid sessionKey.`);
        res.status(401).send('unauthorized\n');
      }
    }
  });
}
app.use(logger('dev'));                                    // log to console
app.use(logger('combined', { stream: accessLogStream }));  // log to file
app.use(cors());                                           // enable cross-origin resource sharing
app.use(bodyParser.json()); 						                   // for  application/json
app.use(bodyParser.urlencoded({extended: false}));         // for application/x-www-form-urlencoded
app.use(authorizedDevice);                                 // check macAddress and sessionKey

const server = app.listen(8083, function () {
    const host = server.address().address;
    const port = server.address().port;
    console.log('listening');
    debug('app listening at http://%s:%s', host, port)
});

// Add data point to databases
app.post('/itpower-data', function(req,res) {
  const macAddress = req.body.macAddress;
  const data = req.body.data;
  if (!data) {
    res.status(400).send(`Bad request, data can not be null\n`);
    return;
  }
  if (macAddress != process.env.PRIMARY_AUTH_KEY) {
    res.status(400).send(`device not authorized to post`);
    return;
  }

  const key_order = Object.keys(data).map(key => { return key });
  const values = Object.keys(data).map(val => {
    if (typeof data[val] == 'string') {
      return '"' + data[val] + '"';
    } else {
    return data[val]
    }
  });
  const insert = `INSERT INTO data (${key_order.join(',')}) VALUES (${values.join(',')})`;
  //const params = [macAddress, data];
  debug(insert);

  pool.query(insert, (error, results, fields) => {
    if (error) {
      console.error(error);
      res.status(500).send('server error\n');
    } else {
      // location header points to the new resource
      res.location(`/data/${results.insertId}`);
      res.status(201).send(`Created ${results.insertId}\n`);
    }
  });

});

// Get all the data submitted for a MAC address
app.get('/itpower-data', function(req,res) {
  const macAddress = req.body.macAddress || req.query.macAddress;
  const query = 'SELECT * FROM data';
  const params = [macAddress];
  debug(query, params);

  pool.query(query, params, (error, results, fields) => {
    // return pretty JSON which is inefficient but much easier to understand
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(results, null, 2));
  });
});

app.get('/itpower-data/by-category', function(req, res) {
  let category = req.body.category;
  const macAddress = req.body.macAddress;
  const query = `select ${category} FROM data;`
  const params = [macAddress];
  debug(query, params);

  pool.query(query, params, (error, results, fields) => {
    res.setHeader('Content-Type', 'appplication/json');
    res.end(JSON.stringify(results, null, 2));
  })
})

app.get('/itpower-data/by-time', function(req, res) {
  const dateFrom = moment(req.body.dateFrom).format('YYYY-MM-DD HH:mm:ss');
  const macAddress = req.body.macAddress;
  const dateTo = moment(req.body.dateTo).format('YYYY-MM-DD HH:mm:ss');
  const query = `select * FROM data where recorded_at between '${dateFrom}' and '${dateTo}';`
  const params = [macAddress];
  debug(query, params);
  pool.query(query, params,(error, results, fields) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(results, null, 2));
  })
})

// Get one record by id and MAC address
app.get('/itpower-data/:transactionID', function(req,res) {
  const transactionID = req.params.transactionID;
  const macAddress = req.body.macAddress;
  const query = 'SELECT * FROM data WHERE id=?';
  const params = [transactionID, macAddress];
  debug(query, params);

  pool.query(query, params, (error, results, fields) => {
    if (error) {
      console.error(error);
      res.status(500).send('server error\n');
    } else if (results.length > 0) {
      // return pretty JSON which is inefficient but much easier to understand
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(results[0], null, 2));
    } else {
      res.status(404).send(`Id ${transactionID} not found for ${macAddress}\n`);
    }
  });
});

//// Delete one record by id and MAC address
//app.delete('/data/:transactionID', function(req,res) {
//  const transactionID = req.params.transactionID;
//  const macAddress = req.body.macAddress;
//
//  const query = 'DELETE FROM readings WHERE mmac_addressac_address = ? AND id = ?';
//  sjj
//  const params = [macAddress, transactionID];
//  debug(query, params);
//
//  pool.query(query, params, (error, results, fields) => {
//    if (results.affectedRows > 0) {
//      res.status(200).send('OK\n');
//    } else {
//      res.status(404).send(`Id ${transactionID} not found\n`);
//    }
//  });
//});

app.get('/', function(req,res) {
  res.send('hello');
});
