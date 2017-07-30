DROP TABLE IF EXISTS Timers CASCADE;
DROP TABLE IF EXISTS ChannelPermissions CASCADE;
DROP TYPE IF EXISTS ChannelType CASCADE;

CREATE TYPE ChannelType AS ENUM ('text', 'voice');

CREATE TABLE Timers (
    GuildId varchar(64) NOT NULL,
    Start int NOT NULL,
    Duration int NOT NULL,
    Name varchar(64) NOT NULL,
    Type ChannelType NOT NULL,
    UserLimit int NOT NULL DEFAULT(0),
    PRIMARY KEY (GuildId, Name)
);

CREATE TABLE ChannelPermissions (
    GuildId varchar(64) NOT NULL,
    ChannelName varchar(64) NOT NULL,
    RoleId varchar(64) NOT NULL,
    PRIMARY KEY (GuildId, ChannelName, RoleId),
    FOREIGN KEY (GuildId, ChannelName) REFERENCES Timers(GuildId, Name)
);