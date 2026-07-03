-- Data fix: backing-a-full-raise events were mislabeled "referral_verified"
-- before the real referral system existed. Real referral events carry a
-- "referral:<id>" verification_source; everything else relabels.
update pulse_events
   set action_type = 'raise_backed'
 where action_type = 'referral_verified'
   and verification_source not like 'referral:%';
