const Discord = require('discord.js');
const access = require('./access.js');
const pg = require('pg');
const client = new Discord.Client();
const cycleDuration = 7 * 24 * 3600 * 1000;
const AccessRights = {
    FULL : 0,
    LIMITED : 1,
    NONE : 2
}
const days = {
    "mon" : 0,
    "tue" : 1,
    "wed" : 2,
    "thu" : 3,
    "fri" : 4,
    "sat" : 5,
    "sun" : 6
}
const daysNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

class ChannelTimer {    
    constructor(when, duration, channelName, type, limit, roles) {
        if (duration >= cycleDuration) {
            throw "Invalid argument: duration can't be longer than a cycle";
        }
        this.when = when;
        this.duration = duration;
        this.channelName = channelName;
        this.type = type;
        this.limit = limit;
        this.roles = roles;
    }
    
    static print(timer) {
        var out =
            timer.channelName + ": " + 
            ChannelTimer.toDate(timer) +
            " (max " + timer.limit + " users)";
        return out;
    }
    
    static fromCommand(cmd, guild) {
        var tokens = cmd.split(" ");
        if (tokens.length < 7) {
            throw "Insufficient number of arguments. Correct format: $create <day> <start> <end> <name> <type> <limit>";
        }
        tokens[1] = tokens[1].substring(0, 4).toLowerCase();
        var day = days[tokens[1]];
        if (typeof day === "undefined") { 
            throw "Incorrect day format. Accepted format is Mon(day) [case insensitive]";
        }
        
        var start = tokens[2].split(":");
        var end = tokens[3].split(":");
        if (start.length < 2 || end.length < 2) {
            throw "Incorrect hour format. Accepted fomat is HH:MM"
        }
        var start = 1000 * (parseInt(start[0]) * 3600 + parseInt(start[1]) * 60);
        var end = 1000 * (parseInt(end[0]) * 3600 + parseInt(end[1]) * 60);
        if (isNaN(start) || isNaN(end)) {
            throw "Hour or minutes are of an incorrect format"
        }
        if (start > end) {
            throw "Incorrect specification. Start time must be before end time";
        }
        
        start = start + day * 3600 * 24 * 1000;
        end = end + day * 3600 * 24 * 1000;
        
        var name = tokens[4];
        var type = tokens[5];
        if (!(type === "voice") && !(type === "text")) {
            throw "Channel type can only be 'voice' or 'text'"
        }
        
        var limit = parseInt(tokens[6]);
        if (isNaN(limit)) {
            throw "Limit must be an integer number";
        }
        
        var idx;
        var roles = [];
        for (idx = 7 ; idx < tokens.length ; idx++) {
            var role = guild.roles.find("name", tokens[idx]);
            if (role) { roles.push(role.id); }
        }
        
        return new ChannelTimer(start, (end - start), name, type, limit, roles);
    }
    
    static toDate(timer) {
        var day = Math.floor(timer.when / (3600 * 24 * 1000));
        var start = timer.when % (3600 * 24 * 1000);
        var sH = Math.floor(start / (3600 * 1000));
        var sM = Math.floor((start % (3600 * 1000)) / (60 * 1000));
        var end = start + timer.duration;
        var eH = Math.floor(end / (3600 * 1000));
        var eM = Math.floor((end % (3600 * 1000)) / (60 * 1000));
        var out =
            daysNames[day] +
            " from " + sH + ":" + sM +
            " to " + eH + ":" + eM;
        return out;
    }
}

function reload(guilds) {
    pool.query(
        "SELECT * FROM Timers"
    )
    .then(res => {
        var n = 0;
        for (idx in res.rows) {
            var row = res.rows[idx];
            var guild = guilds.get(row.guildid);
            if (guild) {
                pool.query(
                    "SELECT RoleId FROM ChannelPermissions WHERE GuildId = $1::text AND ChannelName = $2::text",
                    [row.guildid, row.name]
                )
                .then(res => {
                    var permissions = [];
                    for (idx in res.rows) {
                        var permission = res.rows[idx];
                        permissions.push(permission.roleid);
                    }
                    timer = new ChannelTimer(row.start, row.duration, row.name, row.type, row.userlimit, permissions);
                    startTimer(guild, timer);
                })
                .catch(e => {throw e;})
            }
        }
    })
    .catch(e => { throw e; });
}

function authenticate(member, guild) {
    if (!member) { return AccessRights.NONE; }
    else if (member.permissions.has("ADMINISTRATOR")) { return AccessRights.FULL; }
    else { return AccessRights.NONE; }
}

function stop(guildId, channelName, callback) {
    pool.query(
        "DELETE FROM ChannelPermissions WHERE GuildId = $1::text AND ChannelName = $2::text",
        [guildId, channelName]
    )
    .then(res => {
        pool.query(
            "DELETE FROM Timers WHERE GuildId = $1::text AND Name = $2::text",
            [guildId, channelName]
        )
        .then(res => { callback(res); })
        .catch(e => {throw e;});
    })
    .catch(e => { throw e; });
}

function stopAll(guildId, callback) {
    pool.query(
        "DELETE FROM ChannelPermissions WHERE GuildId = $1::text",
        [guildId]
    )
    .then(res => {
        pool.query(
            "DELETE FROM Timers WHERE GuildId = $1::text",
            [guildId]
        )
        .then(callback)
        .catch(e => { throw e; });
    })
    .catch(e => { throw e; });
}

function list(guildId, channel) {
    pool.query(
        "SELECT * FROM Timers WHERE GuildId = $1::text",
        [guildId]
    )
    .then(res => {
        var n = 0;
        var reply = "Your current timed channels are: \n";
        var timer;
        for (idx in res.rows) {
            var row = res.rows[idx];
            timer = new ChannelTimer(row.start, row.duration, row.name, row.type, row.userlimit);
            reply = reply + (n + 1) + " - \t" + ChannelTimer.print(timer) + "\n";
            n = n + 1;
        }        
        if (n > 0) {
            channel.send(reply);
        }
        else {
            channel.send("You have currently no timed channels");
        }
    })
    .catch(e => { throw e; });
}

function listRoles(channelName, message) {
    pool.query(
        "SELECT RoleId FROM ChannelPermissions WHERE GuildId = $1::text AND ChannelName = $2::text",
        [message.guild.id, channelName]
    )
    .then(res => {
        var output;
        if (res.rowCount > 0) {
            output = "Channel " + channelName + " can be accessed by the following roles:\n";
            for (idx in res.rows) {
                var row = res.rows[idx];
                var roleName = message.guild.roles.get(row.roleid);
                output = output + roleName + "\n"
            }
        }
        else {
            output = "Channel " + channelName + " can be accessed by anyone.";
        }
        message.channel.send(output);
    })
    .catch(e => {throw e;});
}

function create(message) {
    var timer;
    var kaboom = false;

    try {
        timer = ChannelTimer.fromCommand(Discord.Util.escapeMarkdown(message.content), message.guild); 
    }
    catch (e) {
        message.channel.send(e);
        kaboom = true;
    }  

    if (!kaboom) {
        pool.query(
            "SELECT COUNT(*) AS count FROM Timers WHERE guildid = $1::text AND name = $2::text",
            [message.guild.id, timer.channelName]
        )
        .then(res => {
            if (res.rows[0].count > 0) {
                message.channel.send("Sorry, a timed channel with that name already exists");
            }
            else {
                putTimer(message.guild.id, timer, () => {
                    startTimer(message.guild, timer);
                    message.channel.send("Done! Created timer: \n" + ChannelTimer.toDate(timer));
                });
            }
        })
        .catch(e => { throw e; });
    }
}

function putTimer(guildId, timer, callback) {
    pool.query(
        "INSERT INTO Timers (GuildId, Start, Duration, Name, Type, UserLimit)" +
        "VALUES ($1::text, $2, $3, $4::text, $5::channelType, $6)",
        [guildId, timer.when, timer.duration, timer.channelName, timer.type, timer.limit]
    )
    .then(res => {
        function insertRole(idx) {
            if (idx < timer.roles.length) {
                var role = timer.roles[idx];
                pool.query(
                    "INSERT INTO ChannelPermissions (GuildId, ChannelName, RoleId)" +
                    "VALUES ($1::text, $2::text, $3::text)",
                    [guildId, timer.channelName, role]
                )
                .then(res => { insertRole(idx + 1); })
                .catch(e => {throw e; });
            }
            else {
                callback();
            }
        }
        insertRole(0);
    })
    .catch(e => { throw e; });
}

function startTimer(guild, timer) {
    var now = (Date.now() - (1000 * 3600 * 24 * 4)) % cycleDuration; // 01/01/2017 was a Thursday, must subtract 3 days
    var whenNext;
    if (now > timer.when) {
        whenNext = cycleDuration - now + timer.when;
    }
    else {
        whenNext = timer.when - now;
    }
    setTimeout(createTimeoutChannel, whenNext, guild, timer);
}

function createTimeoutChannel(guild, timer) {
    pool.query(
        "SELECT * FROM Timers WHERE guildid = $1::text AND name = $2::text",
        [guild.id, timer.channelName]
    )
    .then(res => {
        if (res.rowCount == 0) {
            console.log("Can't find timer in records. Maybe it was deleted.");
            console.log("Guild: " + guild.name + " at channel: " + timer.channelName);
        }
        else {    
            guild.createChannel(timer.channelName, timer.type)
            .then(channel => {
                if (channel instanceof Discord.VoiceChannel) { channel.setUserLimit(timer.limit); }
                if (timer.roles.length > 0) {
                    var me = guild.members.get(access.myId).user;
                    channel.overwritePermissions(
                        me,
                        {
                            'CONNECT' : true,
                            'SPEAK' : true,
                            'READ_MESSAGES' : true,
                            'SEND_MESSAGES' : true
                        }
                    )
                    .then(() => {
                        var everyone = guild.roles.find("name", "@everyone");
                        channel.overwritePermissions(
                            everyone,
                            {
                                'CONNECT' : false,
                                'SPEAK' : false,
                                'READ_MESSAGES' : false,
                                'SEND_MESSAGES' : false
                            }
                        )
                        .catch(e => {throw e;});

                        for (roleIdx in timer.roles) {
                            var roleId = timer.roles[roleIdx];
                            channel.overwritePermissions(
                                guild.roles.get(roleId),
                                {
                                    'CONNECT' : true,
                                    'SPEAK' : true,
                                    'READ_MESSAGES' : true,
                                    'SEND_MESSAGES' : true
                                }
                            )
                            .catch(e => { throw e; });
                        }
                    })
                    .catch(e => {throw e;});
                }
                console.log('Created channel: ' + channel.name + " in guild: " + channel.guild.name);
                setTimeout(channel => { 
                    console.log("Deleted channel: " + channel.name + " in guild: " + channel.guild.name);
                    channel.delete(); 
                }, timer.duration, channel); } 
            )
            .catch(e => { throw e; });
            setTimeout(createTimeoutChannel, cycleDuration, guild, timer); 
        }
    })
    .catch(e => { console.log(e); });
}

function handle(message) {
    var rights = authenticate(message.member, message.guild);
    if (rights == AccessRights.NONE) { return; }
    
    try {
        if (message.content === "$help") {
            var help =  "This bot allows creating timed channels that open up with a given weekly " +
                        "schedule and last a given amount of time.\n\n" +
                        "Commands:\n" +
                        "$help: Shows this message\n" +
                        "$create <day> <start> <end> <name> <type> <limit> [<roles>]: " +
                        "Creates channel <name> on <day> at hour <start> until <end>. " +
                        "Name must be unique per guild. Type can be either 'voice' or 'text'. " +
                        "Day can be Mon(day), Tue(sday) etc, case insensitive. " +
                        "Time must be specified as HH:MM, 24-hour format (no am pm). " +
                        "Up to <limit> people can join the channel. Use 0 for unlimited. " +
                        "Optionally, it is possible to restrict access to a list of roles.\n" +
                        "$list: lists all currently scheduled channels\n" +
                        "$listRoles <name>: lists all role that can access a given scheduled channel\n" +
                        "$stopAll: cancels all scheduled channels. Active channels will stay on " +
                        "until they time out\n" + 
                        "$stop <name>: cancels the given scheduled channel.\n";
            message.channel.send(help);
        }
        else if (message.content.startsWith("$create")) {
            create(message);
        }
        else if (message.content === "$list") {
            list(message.guild.id, message.channel);
        }
        else if (message.content.startsWith("$listRoles")) {
            var channelName = message.content.split(" ")[1];
            if (channelName) {
                listRoles(channelName, message);
            }
            else {
                message.channel.send("There is not timed channel with that name");
            }
        }
        else if (message.content === "$stopAll") {
            stopAll(message.guild.id, () => { message.channel.send("Done! All your timers were deleted."); });
        }
        else if (message.content.startsWith("$stop")) {
            var channel = message.content.split(" ", 2)[1];
            if (channel) {
                stop(message.guild.id, channel, res => {
                    if (res.rowCount > 0) {
                        message.channel.send("Done! Timed channel was deleted");
                    }
                    else {
                        message.channel.send("A channel with that name does not exist");
                    }
                });
            }
        }
    }
    catch (err) {
        console.log(err);
        message.channel.send("Sorry, an error occurred while processing your command");
    }
}

// Init
pg.defaults.ssl = true;
const pool = new pg.Pool({connectionString : process.env.DATABASE_URL});

client.on('ready', () => { console.log("Ciao mbare"); reload(client.guilds); });
client.on('message', handle);
client.login(access.token);