const express = require('express');
const cors = require('cors');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const mysql = require("mysql");
const bodyParser = require('body-parser');
const port = 3000;

var corsOptions = {
    origin: '*',
    optionsSuccessStatus: 200 // some legacy browsers (IE11, various SmartTVs) choke on 204
}
app.use(cors(corsOptions));
io.set('origins', '*:*');
app.use(bodyParser.json()); // support json encoded bodies
app.use(bodyParser.urlencoded({extended: true})); // support encoded bodies
app.use(express.static(__dirname + '/public'));

const con = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '123',
    database: 'chat'
});
con.connect((err) => {
    if (err) throw err;
    console.log('DB Connected!');
});

//romeId: userID
var rooms = {}
// var rooms = {1:[]}

var getRoom = function (soc, cb) {
    Object.keys(rooms).forEach(room => {
        rooms[room].forEach(client => {
            if (client.socket == soc) {
                cb({client:client, roomId:room});
            }
        });
    });
};

io.on('connection', socket => {
    socket.on('new-user', data => {
        data = JSON.parse(data);

        let token = new Buffer(`${data.token}`, 'base64').toString('ascii');
        let userId = token.split("@")[0];
        let userMobile = token.split("@")[1];
        let tokenTimestampGenerate = token.split("@")[2];

        let roomId = data.roomId;

        if(rooms[roomId]===undefined){
            rooms[roomId] = [];
        }
        rooms[roomId].push({
            id: socket.id,
            socket: socket,
            name: userMobile
        });

        /*rooms[roomId]={
            id: socket.id,
            socket: socket,
            name: userMobile
        };
*/
        //var test = {}
        //test[1]={name:"test"}

        rooms[roomId].forEach(element => {
            if (element.socket != socket) {
                element.socket.emit('user-connected', userMobile);
            }
        });
    });
    socket.on('send-chat-message', message => {
        message = JSON.parse(message);

        let token = new Buffer(`${message.token}`, 'base64').toString('ascii');
        let userId = token.split("@")[0];
        let userMobile = token.split("@")[1];
        let tokenTimestampGenerate = token.split("@")[2];

        let roomId = message.roomId;
        rooms[roomId].forEach(element => {
            if (element.socket != socket) {
                element.socket.emit('chat-message', {message: message.message, name: userMobile});
            }
        });
    });
    socket.on('disconnect', () => {
        // console.log(socket);
        getRoom(socket, function (soc) {
            // console.log(soc.client.name);
            rooms[soc.roomId].forEach(element => {
                if (element.socket != socket) {
                    element.socket.emit('user-disconnected', soc.client.name);
                    delete rooms[soc.roomId][soc.client]
                }
            });

            // console.log(soc);
        })
        // socket.broadcast.emit('user-disconnected', users[socket.id])
        // delete users[socket.id]
    })
    socket.on('typing', (data) => {
        data = JSON.parse(data);

        let token = new Buffer(`${data.token}`, 'base64').toString('ascii');
        let userId = token.split("@")[0];
        let userMobile = token.split("@")[1];
        let tokenTimestampGenerate = token.split("@")[2];

        let roomId = data.roomId;
        rooms[roomId].forEach(element => {
            if (element.socket != socket) {
                element.socket.emit('typing', userMobile);
            }
        });
        // socket.broadcast.emit('typing', users[socket.id])
    })
    socket.on('not-typing', (data) => {
        data = JSON.parse(data);

        let token = new Buffer(`${data.token}`, 'base64').toString('ascii');
        let userId = token.split("@")[0];
        let userMobile = token.split("@")[1];
        let tokenTimestampGenerate = token.split("@")[2];

        let roomId = data.roomId;
        rooms[roomId].forEach(element => {
            if (element.socket != socket) {
                element.socket.emit('not-typing', userMobile);
            }
        });

        // socket.broadcast.emit('not-typing', users[socket.id])
    })
})

app.get('/', function (req, res, next) {
    res.render('index.ejs');
});

app.get('/room/:id', function (req, res, next) {
    res.render('room.ejs');
});

app.post('/addRoom', function (req, res) {
    if(("token" in req.headers)===false){
        return res.status(200).send({error: false, message: 'notExistToken', data: ''});
    }
    let token = new Buffer(`${req.headers.token}`, 'base64').toString('ascii');
    let userId = token.split("@")[0];
    let userMobile = token.split("@")[1];
    let tokenTimestampGenerate = token.split("@")[2];

    let data = req.body;

    let rooms = `INSERT INTO rooms (title, user_id, max_client, type, created_at) VALUES ('${data.name}', '${userId}', '${data.max_client}', '${data.type}', now());`;
    con.query(rooms, (err,rows) => {
        if(err){
            return res.status(200).send({error: false, message: 'roomNameDuplicate', data: ''});
        }
        if(rows.length === 0){
            return res.status(200).send({error: false, message: 'noData', data: ''});
        }else {
            if(rows.affectedRows==1){
                let insertId = rows.insertId;
                let addRoomUser = `INSERT INTO room_user (room_id, user_id, created_at) VALUES ('${insertId}', '${userId}', now());`;
                con.query(addRoomUser, (err,rows) => {
                    if(err){
                        return res.status(200).send({error: false, message: 'notInserted', data: ''});
                    }
                    return res.status(200).send({error: true, message: '', data: rows});
                });
            }
        }
    });
});

app.get('/roomsList', function (req, res) {
    let token = new Buffer(`${req.headers.token}`, 'base64').toString('ascii');
    let userId = token.split("@")[0];
    let userMobile = token.split("@")[1];
    let tokenTimestampGenerate = token.split("@")[2];

    var rooms = `select r.id, r.user_id as admin, r.title, r.type, r.max_client, r.created_at, ru.created_at as add_room, (select count(user_id) from room_user where room_id=r.id) as user_now from room_user ru inner join rooms r on ru.room_id = r.id where ru.user_id = ${userId} and r.status='enable'`;
    con.query(rooms, (err,rows) => {
        if(err) throw err;
        if(rows.length === 0){
            return res.status(200).send({error: false, message: 'noData', data: ''});
        }else {
            return res.status(200).send({error: true, message: '', data: rows});
        }
    });
});

app.get('/login', function (req, res) {
    res.render('login.ejs');
});

app.post('/login',cors(corsOptions), function (req, res, next) {
    var data = req.body;
    var searchUser = `SELECT * FROM users where mobile='${data.mobile}'`;
    con.query(searchUser, (err,rows) => {
        if(err) throw err;
        if(rows.length === 0){
            var addUser = `INSERT INTO users (mobile, created_at) VALUES ('${data.mobile}', now());`;
            con.query(addUser, (err,rows) => {
                if(err){
                    return res.status(200).send({error: false, message: 'notInserted', data: ''});
                }
                return res.status(200).send({error: true, message: 'inserted', data: ''});
            });
        }else {
            var getRooms = `select r.id, r.user_id as admin, r.title, r.type, r.max_client, r.created_at, ru.created_at as add_room, (select count(user_id) from room_user where room_id=r.id) as user_now from room_user ru inner join rooms r on ru.room_id = r.id where ru.user_id = ${rows[0].id} and r.status='enable'`;
            con.query(getRooms, (err,rooms) => {
                if(err) throw err;
                if(rows.length === 0){
                    return res.status(200).send({error: false, message: 'noData', data: ''});
                }else {
                    var response = {
                        user: rows[0],
                        rooms: rooms,
                        token: new Buffer(`${rows[0].id}@${rows[0].mobile}@${Date.now()}`).toString('base64')
                    }
                    return res.status(200).send({error: true, message: '', data: response});
                }
            });
        }
    });
});

app.get('/messagesList', function (req, res) {
    let token = new Buffer(`${req.headers.token}`, 'base64').toString('ascii');
    let userId = token.split("@")[0];
    let userMobile = token.split("@")[1];
    let tokenTimestampGenerate = token.split("@")[2];

    var rooms = `select m.id, m.title, m.message,m.status, m.type, m.send_at, u1.mobile as form_user_id from messages m inner join users u1 on u1.id = m.form_user_id where to_user_id = ${userId}`;
    con.query(rooms, (err,rows) => {
        if(err){
            return res.status(200).send({error: false, message: 'noMessage2', data: ''});
        }
        if(rows.length === 0){
            return res.status(200).send({error: false, message: 'noMessage', data: ''});
        }else {
            return res.status(200).send({error: true, message: '', data: rows});
        }
    });
});

app.post('/shareRoom', function (req, res) {
    let data = req.body;
    let token = new Buffer(`${req.headers.token}`, 'base64').toString('ascii');
    let userId = token.split("@")[0];
    let userMobile = token.split("@")[1];
    let tokenTimestampGenerate = token.split("@")[2];

    let room_id = new Buffer(`${data.room}`, 'base64').toString('ascii');

    let getUser = `select id from users where mobile = '${data.mobile}'`;
    con.query(getUser, (err1,rowsUser) => {
        if(err1) throw err1;
        if(rowsUser.length === 0){
            return res.status(200).send({error: false, message: 'noUserFound', data: ''});
        }else {
            let getUser = `insert into room_user (room_id, user_id, created_at) value (${room_id},${rowsUser[0]['id']},now())`;
            con.query(getUser, (err2,rowsUserInsert) => {
                if(err2){
                    return res.status(200).send({error: false, message: 'userAddToRoomDuplicate', data: ''});
                }
                if(rowsUserInsert.length === 0){
                    return res.status(200).send({error: false, message: 'notShare', data: ''});
                }else {
                    if(rowsUserInsert.affectedRows==1){
                        let title = 'share room from '+userMobile;
                        let text = '';
                        let messageSql = `insert into messages (form_user_id, to_user_id, title, message, status, type, created_at, send_at) value (${userId},${rowsUser[0]['id']},'${title}','${text}','new','addRoom',now(),now())`;
                        con.query(messageSql, (err,rowsM) => {
                            if(rowsM.length === 0){
                                return res.status(200).send({error: false, message: 'notSendMessage', data: ''});
                            }
                        });
                        return res.status(200).send({error: true, message: 'shared', data: ''});
                    }
                }
            });
        }
    });
});

app.post('/deletedRoom', function (req, res) {
    let data = req.body;
    let token = new Buffer(`${req.headers.token}`, 'base64').toString('ascii');
    let userId = token.split("@")[0];
    let userMobile = token.split("@")[1];
    let tokenTimestampGenerate = token.split("@")[2];

    var rooms = `UPDATE rooms SET status='deleted' WHERE user_id= ${userId} and id=${data.room}`;
    con.query(rooms, (err,rows) => {
        if(err){
            return res.status(200).send({error: false, message: 'noDeleted2', data: ''});
        }
        if(rows.length === 0){
            return res.status(200).send({error: false, message: 'noDeleted', data: ''});
        }else {
            return res.status(200).send({error: true, message: 'Deleted', data: ''});
        }
    });
});

const server = http.listen(port, function () {
    console.log('listening on *:' + port);
});


//killall -9 node