# Release <version>

- Date: YYYY-MM-DD
- Previous: <previous version, or "first release">
- Range: <previous date or tag>..<release commit>
- Ticket: #<issue number>
- Status: draft

_A release-prep ticket writes this file. Tagging, publishing and merging are done by a human, never by a worker._

## Highlights

- _The two or three changes a player would notice, in player language._ (#<PR>)

## Fixes

- _A defect fixed since the previous release._ (#<PR>)

## Known issues

- _An open defect, an unmerged change, or a story whose evidence says NOT VERIFIED._ (<link or reason>)

## Verification

- `check_command` on <commit>: PASS
- `test_command` on <commit>: PASS
- `production/qa/evidence/<story-slug>/index.md` - Run result: OBSERVED - <what it shows>

## Upgrade notes

- _Save format, input change, engine version, manual step, or "None."_

## Release checklist

- [ ] Version <version> matches the ticket.
- [ ] Every merged pull request in the range is listed or deliberately excluded.
- [ ] `check_command` and `test_command` passed on <commit>.
- [ ] Every highlighted story has an evidence index with an OBSERVED result.
- [ ] Known issues include every NOT VERIFIED item.
- [ ] Upgrade notes cover every change that needs one.
- [ ] A person approved this release.
- [ ] A person or the release manager tagged and published it.
