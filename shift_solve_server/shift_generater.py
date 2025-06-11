# python_shift_solver/shift_solver.py
import copy
from datetime import date, timedelta

def get_teacher_by_id(teachers_orig, teacher_id):
    for teacher in teachers_orig:
        if teacher.get('id') == teacher_id:
            return teacher
    return None

def get_student_by_id(students_orig, student_id):
    for student in students_orig:
        if student.get('id') == student_id:
            return student
    return None

def can_teacher_teach_subject(teacher, student_affiliation, subject, admin_settings):
    if not teacher or not subject or not student_affiliation:
        return False
    teachable_subjects_by_aff = teacher.get('teachableSubjectsByAffiliation', {})
    if student_affiliation not in teachable_subjects_by_aff:
        return False
    return subject in teachable_subjects_by_aff[student_affiliation]

def get_score_for_assignment(student, teacher_status, date_str, period_num, subject, assignments_for_student_on_date):
    """
    特定の割り当て候補に対するスコアを計算する（簡易版）。
    スコアが高いほど良い割り当て。ペナルティは負の値で表現。
    """
    score = 100  # 基本スコア

    # 1. 生徒の空きコマ希望
    idle_pref = student.get('idleTimePreference')
    if idle_pref == '空きコマなし希望':
        is_continuous = False
        if not assignments_for_student_on_date: # その日最初のコマならOK
            is_continuous = True
        else:
            # 直前または直後のコマが既に割り当てられているか
            if period_num - 1 in assignments_for_student_on_date or \
               period_num + 1 in assignments_for_student_on_date:
                is_continuous = True
            # 既存のコマと連続するか (例: 1限と3限の間に2限が入る)
            sorted_assigned_periods = sorted(list(assignments_for_student_on_date))
            for i in range(len(sorted_assigned_periods) -1):
                if sorted_assigned_periods[i+1] - sorted_assigned_periods[i] > 1: # 間に空きがある
                    if period_num > sorted_assigned_periods[i] and period_num < sorted_assigned_periods[i+1]:
                        # 空きを埋める形ならOK
                        is_continuous = True # この評価はより詳細化が必要
                        break
            # 既存のコマの直前直後か
            if period_num == min(sorted_assigned_periods) -1 or period_num == max(sorted_assigned_periods) + 1:
                 is_continuous = True


        if not is_continuous and len(assignments_for_student_on_date) > 0 : # 既にその日にコマがあり、連続しない場合
            score -= 200 # 大きなペナルティ
            print(f"  Debug Score: Student {student.get('name')} idle_pref='空きコマなし希望', but assignment on {date_str} P{period_num} is not continuous with {assignments_for_student_on_date}. Score: {score}")


    elif idle_pref == '空きコマ許容':
        if assignments_for_student_on_date:
            temp_assigned_periods = sorted(list(assignments_for_student_on_date) + [period_num])
            idle_spans = []
            for i in range(len(temp_assigned_periods) - 1):
                idle_spans.append(temp_assigned_periods[i+1] - temp_assigned_periods[i] - 1)
            
            max_idle = max(idle_spans) if idle_spans else 0
            if max_idle == 1: # 1コマ空き
                score -= 10
            elif max_idle == 2: # 2コマ空き
                score -= 50
            elif max_idle > 2: # 3コマ以上の空きは不可
                score -= 1000 # 実質的に割り当て不可
                print(f"  Debug Score: Student {student.get('name')} idle_pref='空きコマ許容', but assignment on {date_str} P{period_num} creates >2 idle. Score: {score}")


    # 2. 講師の負荷分散 (担当コマ数が少ない講師を優先)
    # teacher_status['assigned_slots_count_total'] のようなものが必要
    # 今回は teacher_status['assigned_slots_count_on_day'].get(date_str, 0) でその日のコマ数を見る
    # 値が小さいほどスコアを高くしたいので、マイナスで加算
    score -= teacher_status.get('assigned_slots_count_on_day', {}).get(date_str, 0) * 5 


    # 3. 生徒の集中/分散希望 (簡易的)
    # scheduling_pref = student.get('schedulingPreference')
    # if scheduling_pref == '集中希望':
    #     if len(assignments_for_student_on_date) > 0: # 同じ日に既にコマがある
    #         score += 20
    #     if len(assignments_for_student_on_date) >= 2: # 既に2コマ以上ある日は少しペナルティ（集中しすぎ防止）
    #         score -= 10
    # elif scheduling_pref == '分散希望':
    #     if len(assignments_for_student_on_date) > 0: # 同じ日に既にコマがある
    #         score -= 30 # 分散希望なのに同日はペナルティ


    # print(f"  Score for {student.get('name')}-{subject} with {teacher_status['obj'].get('name')} on {date_str} P{period_num}: {score}")
    return score


def generate_actual_shifts(input_data_orig):
    print("Initializing shift generation process...")
    input_data = copy.deepcopy(input_data_orig)

    teachers_orig = input_data.get('teachers', [])
    students_orig = input_data.get('students', [])
    admin_settings = input_data.get('adminSettings', {})
    constants = input_data.get('constants', {})
    period_definitions = constants.get('PERIOD_DEFINITIONS', {})
    days_of_week_jp = constants.get('DAYS_OF_WEEK_JP', [])

    teachers_status = {
        t['id']: {
            'assigned_slots': set(), # (date_str, period_num)
            'assigned_slots_count_on_day': {}, # {date_str: count}
            'obj': t
        } for t in teachers_orig
    }
    students_status = {
        s['id']: {
            'remaining_desired_units': {
                course['subject']: course['units'] for course in s.get('desiredCourses', [])
            },
            'assigned_slots': set(), # (date_str, period_num)
            'assigned_periods_on_date': {}, # {date_str: set(period_num)}
            'obj': s
        } for s in students_orig
    }
    
    unassigned_student_courses = [] # (student_id, subject, remaining_units)
    assignments = []
    
    available_dates = []
    if admin_settings.get('commonShiftStartDate') and admin_settings.get('commonShiftEndDate'):
        start_date = date.fromisoformat(admin_settings['commonShiftStartDate'])
        end_date = date.fromisoformat(admin_settings['commonShiftEndDate'])
        current_date = start_date
        holidays = set(admin_settings.get('holidays', []))
        while current_date <= end_date:
            date_str = current_date.isoformat()
            if date_str not in holidays:
                available_dates.append(date_str)
            current_date += timedelta(days=1)
    
    print(f"Processing for {len(available_dates)} available dates: {available_dates}")

    # --- フェーズ1: レギュラー生徒と講師の講習会マッチングを最優先 ---
    print("Phase 1: Prioritizing regular student-teacher pairings for workshops...")
    for s_id, s_stat in students_status.items():
        student = s_stat['obj']
        # (フェーズ1のロジックは前回とほぼ同じだが、ステータス更新を新しい構造に合わせる)
        regular_teachers_info = []
        for t_id, t_stat in teachers_status.items():
            teacher = t_stat['obj']
            for reg_class in teacher.get('regularClasses', []):
                if reg_class.get('studentName') == student.get('name') and \
                   reg_class.get('studentAffiliation') == student.get('affiliation') and \
                   reg_class.get('studentGrade') == student.get('grade'):
                    regular_teachers_info.append({'teacher_id': t_id, 'subject': reg_class.get('subject')})
        
        for course_info in student.get('desiredCourses', []):
            subject = course_info.get('subject')
            units_to_assign = s_stat['remaining_desired_units'].get(subject, 0)
            if units_to_assign <= 0: continue

            # この科目を担当するレギュラー講師を探す
            reg_teacher_for_subject = next((rti for rti in regular_teachers_info if rti['subject'] == subject), None)
            if not reg_teacher_for_subject: continue

            teacher_id = reg_teacher_for_subject['teacher_id']
            teacher = teachers_status[teacher_id]['obj']

            if not can_teacher_teach_subject(teacher, student.get('affiliation'), subject, admin_settings):
                continue

            teacher_available_slots = teacher.get('selectedDateSlots', {})
            student_available_slots = student.get('availableLectureSlots', {})
            
            assigned_count_for_this_course_phase1 = 0
            for date_str in available_dates:
                if units_to_assign <= assigned_count_for_this_course_phase1: break
                if date_str not in teacher_available_slots or date_str not in student_available_slots: continue

                day_jp_str = days_of_week_jp[date.fromisoformat(date_str).isoweekday() % 7]
                default_periods = admin_settings.get('defaultShiftPeriodsByDay', {}).get(day_jp_str, [])
                
                possible_t_periods = set(teacher_available_slots.get(date_str, [])).intersection(default_periods)
                possible_s_periods = set(student_available_slots.get(date_str, [])).intersection(default_periods)
                common_periods = sorted(list(possible_t_periods.intersection(possible_s_periods)))

                for period in common_periods:
                    if units_to_assign <= assigned_count_for_this_course_phase1: break
                    slot_key = (date_str, period)
                    if slot_key not in teachers_status[teacher_id]['assigned_slots'] and \
                       slot_key not in s_stat['assigned_slots']:
                        
                        # minDesiredPeriods のチェック (簡易版: この割り当てで0より大きくなるか)
                        # 本来は、この日の合計が minDesiredPeriods に達する見込みがあるかなど、より詳細なチェックが必要
                        min_desired = teacher.get('minDesiredPeriods', 1)
                        # この日の担当コマ数が min_desired 未満で、かつこれが唯一のコマになる可能性は避ける
                        # (ただし、他のコマが後で割り当てられる可能性もあるので難しい)
                        # ここでは一旦、単純に割り当ててみる

                        assignments.append({
                            "date": date_str, "period": period, "teacherId": teacher_id,
                            "teacherName": teacher.get('name'), "studentId": s_id,
                            "studentName": student.get('name'), "subject": subject
                        })
                        teachers_status[teacher_id]['assigned_slots'].add(slot_key)
                        teachers_status[teacher_id]['assigned_slots_count_on_day'][date_str] = \
                            teachers_status[teacher_id]['assigned_slots_count_on_day'].get(date_str, 0) + 1
                        
                        s_stat['assigned_slots'].add(slot_key)
                        s_stat['assigned_periods_on_date'].setdefault(date_str, set()).add(period)
                        s_stat['remaining_desired_units'][subject] -= 1
                        assigned_count_for_this_course_phase1 += 1
                        print(f"Phase 1 Assign (Regular): {student.get('name')}({subject}) with {teacher.get('name')} on {date_str} P{period}")


    # --- フェーズ2: 残りの希望コマをスコアリングベースで割り当て ---
    print("Phase 2: Assigning remaining desired courses with scoring...")
    
    # 割り当てるべきコマのリストを作成 (生徒ID, 科目, 残りユニット数)
    コマリスト = []
    for s_id, s_stat in students_status.items():
        for subject, units in s_stat['remaining_desired_units'].items():
            if units > 0:
                コマリスト.extend([(s_id, subject, unit_num) for unit_num in range(units)]) # 1コマずつ処理

    # コマリストを何らかの順序でソート（例：制約の厳しい生徒優先など。今回は単純な順）
    # コマリスト.sort(key=lambda x: students_status[x[0]]['obj'].get('some_priority_factor', 0), reverse=True)

    for student_id, subject, _ in コマリスト: # 1コマずつ割り当てを試みる
        student_stat = students_status[student_id]
        student = student_stat['obj']
        
        if student_stat['remaining_desired_units'].get(subject, 0) <= 0:
            continue # この科目は既に充足

        best_candidate = None # (score, date_str, period_num, teacher_id)
        
        # 候補となる講師をリストアップ
        capable_teachers = []
        for t_id, t_stat_loop in teachers_status.items():
            teacher_loop = t_stat_loop['obj']
            if can_teacher_teach_subject(teacher_loop, student.get('affiliation'), subject, admin_settings):
                capable_teachers.append(teacher_loop)

        if not capable_teachers:
            print(f"  No capable teacher for {student.get('name')} - {subject}. Skipping this unit.")
            unassigned_student_courses.append({'studentName': student.get('name'), 'studentId': student_id, 'subject': subject, 'units_left': student_stat['remaining_desired_units'].get(subject,0) })
            student_stat['remaining_desired_units'][subject] = 0 # これ以上探さない
            continue
            
        for teacher_obj_cand in capable_teachers:
            teacher_id_cand = teacher_obj_cand.get('id')
            t_stat_cand = teachers_status[teacher_id_cand]
            
            teacher_available_slots = teacher_obj_cand.get('selectedDateSlots', {})
            student_available_slots = student.get('availableLectureSlots', {})

            for date_str_cand in available_dates:
                if date_str_cand not in teacher_available_slots or date_str_cand not in student_available_slots:
                    continue

                day_jp_str = days_of_week_jp[date.fromisoformat(date_str_cand).isoweekday() % 7]
                default_periods = admin_settings.get('defaultShiftPeriodsByDay', {}).get(day_jp_str, [])

                possible_t_periods = set(teacher_available_slots.get(date_str_cand, [])).intersection(default_periods)
                possible_s_periods = set(student_available_slots.get(date_str_cand, [])).intersection(default_periods)
                common_periods = sorted(list(possible_t_periods.intersection(possible_s_periods)))

                for period_cand in common_periods:
                    slot_key = (date_str_cand, period_cand)
                    if slot_key in t_stat_cand['assigned_slots'] or slot_key in student_stat['assigned_slots']:
                        continue # 既にどちらかが埋まっている

                    # minDesiredPeriods の事前チェック（簡易）
                    # この1コマを割り当てたとして、その日の講師のコマ数が minDesiredPeriods に届くか、
                    # または既に超えているか。もしこの1コマだけで、minDesiredPeriods に満たないなら避ける。
                    current_teacher_day_slots = t_stat_cand['assigned_slots_count_on_day'].get(date_str_cand, 0)
                    min_desired_for_teacher = teacher_obj_cand.get('minDesiredPeriods', 1)
                    
                    # このコマを割り当てると min_desired を満たせるか、または既に満たしているか
                    # ただし、このコマが min_desired を満たすための最後の1コマでない限り、
                    # 他のコマで満たされる可能性もある。
                    # ここでは、「このコマを割り当てても、その日の合計が min_desired 未満で、かつ、
                    # 他に割り当てられる見込みがない（希望コマが少ないなど）」場合はペナルティ。
                    # 今回は単純化のため、スコアリング関数内で考慮する。
                    
                    # 割り当てた場合の生徒のその日のコマ状況
                    student_assignments_on_date_if_assigned = student_stat['assigned_periods_on_date'].get(date_str_cand, set()).copy()
                    # student_assignments_on_date_if_assigned.add(period_cand) # スコアリング関数内で仮追加して評価

                    score = get_score_for_assignment(student, t_stat_cand, date_str_cand, period_cand, subject, student_stat['assigned_periods_on_date'].get(date_str_cand, set()))
                    
                    # 講師のminDesiredPeriodsペナルティ
                    # もしこの割り当てでその日のコマ数が min_desired 未満のままなら大きなペナルティ
                    # ただし、他のコマで充足する可能性もあるので、ここでは「この1コマだけ」になる場合を特に問題視
                    if current_teacher_day_slots + 1 < min_desired_for_teacher and len(teacher_obj_cand.get('selectedDateSlots', {}).get(date_str_cand, [])) == current_teacher_day_slots + 1 : # この日がこのコマだけになる場合
                         if min_desired_for_teacher > 1: # 1コマ希望なら問題なし
                            score -= 500 # minDesiredPeriods未達で、かつこの日これ以上希望がない場合
                            print(f"  Debug Score: Teacher {teacher_obj_cand.get('name')} minDesiredPeriods penalty for {date_str_cand}. Score: {score}")


                    if best_candidate is None or score > best_candidate[0]:
                        best_candidate = (score, date_str_cand, period_cand, teacher_id_cand)
        
        if best_candidate and best_candidate[0] > -500: # ペナルティが大きすぎるものは避ける
            score, d, p, t_id = best_candidate
            slot_key = (d, p)
            
            assignments.append({
                "date": d, "period": p, "teacherId": t_id,
                "teacherName": teachers_status[t_id]['obj'].get('name'), "studentId": student_id,
                "studentName": student.get('name'), "subject": subject
            })
            teachers_status[t_id]['assigned_slots'].add(slot_key)
            teachers_status[t_id]['assigned_slots_count_on_day'][d] = \
                teachers_status[t_id]['assigned_slots_count_on_day'].get(d, 0) + 1
            
            student_stat['assigned_slots'].add(slot_key)
            student_stat['assigned_periods_on_date'].setdefault(d, set()).add(p)
            student_stat['remaining_desired_units'][subject] -= 1
            print(f"Phase 2 Assign (Scored): {student.get('name')}({subject}) with {teachers_status[t_id]['obj'].get('name')} on {d} P{p} (Score: {score:.0f})")
        else:
            # この1ユニットは割り当てられなかった
            print(f"  Could not find suitable assignment for {student.get('name')} - {subject} (best score: {best_candidate[0] if best_candidate else 'N/A'}).")
            # unassigned_student_courses にはループの最初で追加済みなので、ここでは何もしない

    # --- 最終チェック: 未割り当てコマの整理 ---
    final_unassigned = []
    for s_id, s_stat in students_status.items():
        student_obj = s_stat['obj']
        for subject, units_left in s_stat['remaining_desired_units'].items():
            if units_left > 0:
                final_unassigned.append({
                    'studentName': student_obj.get('name'),
                    'studentId': s_id,
                    'subject': subject,
                    'units_left': units_left
                })
    if final_unassigned:
        print("--- Unassigned Student Courses ---")
        for item in final_unassigned:
            print(f"  Student: {item['studentName']} (ID: {item['studentId']}), Subject: {item['subject']}, Units Left: {item['units_left']}")
        # assignments リストに未割り当て情報を含めるか、別のキーで返すかは要検討
        # ここでは、assignments とは別に返す想定で、Flask側でレスポンスに含める
        # (ただし、現在のFlaskのレスポンスは assignments のみ期待している)
        # assignments.append({"unassigned_info": final_unassigned}) # 一時的な対策


    # --- フェーズ3 & 4 (プレースホルダー) ---
    print("Phase 3: Adjusting for teacher's minDesiredPeriods (Placeholder)...")
    # 講師のminDesiredPeriods充足チェックと報告
    for t_id, t_stat in teachers_status.items():
        teacher = t_stat['obj']
        min_desired = teacher.get('minDesiredPeriods', 1)
        for date_str in available_dates:
            if date_str in teacher.get('selectedDateSlots', {}): # その日に出勤希望がある
                assigned_on_day = t_stat['assigned_slots_count_on_day'].get(date_str, 0)
                if 0 < assigned_on_day < min_desired:
                    print(f"  Warning: Teacher {teacher.get('name')} on {date_str} has {assigned_on_day} assignments, less than minDesired {min_desired}.")
                    # ここでペナルティを再計算したり、調整ロジックを入れることも可能

    print("Phase 4: Optimizing based on student preferences (Placeholder)...")

    print(f"Shift generation process finished. Total assignments: {len(assignments)}")
    return assignments
