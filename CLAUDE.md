files in this project are for a health diary, to be used only via https at https://healthdiary-app.duckdns.org
The design, is documented in "doco/detailed_design.md"
project_status.md contains a description of where we're up to - feel freet o keep[ that updated appropriately.

When fixing problems, avoid patching the target environment unless explicitly asked to do so, rather modify the deployment scripts, dockerfile etc, so that any change is repeatable. 
You may patch the system only as a diagnostic precursur to properly maintaing the deployment scripts. 
