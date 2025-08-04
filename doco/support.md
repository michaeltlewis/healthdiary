here's how to list the users: 
ssh -i ~/.ssh/healthdiary-key ec2-user@healthdiary-app.duckdns.org 'sqlite3 /opt/healthdiary/server/data/healthdiary.db "select * from users"'

and using the user id you can then 
aws s3 ls s3://healthdiary--audio/users/935ed442-da21-461c-a028-518967f01f7d/audio-files/


how to check docker logs:
ssh -i ~/.ssh/healthdiary-key ec2-user@healthdiary-app.duckdns.org "sudo docker logs healthdiary --tail 50 "


how to get userid from username:
ssh -i ~/.ssh/healthdiary-key ec2-user@healthdiary-app.duckdns.org 'sqlite3 /opt/healthdiary/server/data/healthdiary.db "select id from users where username=\"mlewis3\""'



