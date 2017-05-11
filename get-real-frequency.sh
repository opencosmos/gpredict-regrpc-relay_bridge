#!/bin/bash

set -euo pipefail

if ! (( $# )); then
	printf >&2 -- "%s\n" \
		"Syntax: $0 <target>" \
		"Example: $0 gs:terrassa"
	exit 1
fi

declare -r target="$1"

declare -r localname="$(echo "$(id -nu)-$(hostname -s)" | sed -e 's/[^a-zA-Z0-9_]/_/g;')"

(
printf -- "%s\n" \
	"$target" \
	"Sequence=1" \
	"Command=Read" \
	"Key=RX frequency" \
	"SEND" \
	"$target" \
	"Sequence=2" \
	"Command=Read" \
	"Key=TX frequency" \
	"SEND"
sleep 1
) | ./regrpccli ::1 49501 "$localname" \
| perl -e '
	use strict;
	use warnings;
	my $key;
	my $node;
	my $prev;
	while (<>) {
		chomp;
		$node = $prev if m{^\[Response\]$};
		$prev = $_;
		next unless m{^(Key|Value)};
		$key = $1 if m{^Key=(.*)$};
		print "$node> $key: $1\n" if m{^Value=(.*)$};
	}
	print STDERR "Query failed" if not defined $key;' \
| sort -u
